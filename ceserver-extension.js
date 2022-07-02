const MEM_MAPPED = 262144;
const MEM_PRIVATE = 131072;

const PAGE_NOACCESS = 1;
const PAGE_READONLY = 2;
const PAGE_READWRITE = 4;
const PAGE_WRITECOPY = 8;
const PAGE_EXECUTE = 16;
const PAGE_EXECUTE_READ = 32;
const PAGE_EXECUTE_READWRITE = 64;

const PROT_READ = 1;
const PROT_WRITE = 2;
const PROT_EXEC = 4;

const MAP_SHARED = 1;
const MAP_PRIVATE = 2;
const MAP_ANONYMOUS = 32;

const VQE_PAGEDONLY = 1;
const VQE_DIRTYONLY = 2;
const VQE_NOSHARED = 4;

const EXTCMD_ALLOC = 0;
const EXTCMD_FREE = 1;
const EXTCMD_CREATETHREAD = 2;
const EXTCMD_LOADMODULE = 3;
const EXTCMD_SPEEDHACK_SETSPEED = 4;

function getUInt64(dataview, byteOffset, littleEndian) {
  // split 64-bit number into two 32-bit (4-byte) parts
  const left = dataview.getUint32(byteOffset, littleEndian);
  const right = dataview.getUint32(byteOffset + 4, littleEndian);

  // combine the two 32-bit values
  const combined = littleEndian ? left + 2 ** 32 * right : 2 ** 32 * left + right;

  return combined;
}

var allocList = {};

/*speedhack*/
var hookFlag = false;

var initialclock = new Array(10);
for (let y = 0; y < 10; y++) {
  initialclock[y] = {
    result: 0,
    initialoffset: { tv_sec: 0, tv_nsec: 0 },
    initialtime: { tv_sec: 0, tv_nsec: 0 },
  };
}

var initial_offset_tod_tv = { tv_sec: 0, tv_usec: 0 };
var initial_time_tod_tv = { tv_sec: 0, tv_usec: 0 };

var speedmultiplier = 1.0;
const PS = Process.pointerSize;

var coreLibraryName = null;

var clock_gettimePtr = Module.findExportByName(coreLibraryName, 'clock_gettime');
var clock_gettime = new NativeFunction(clock_gettimePtr, 'int', ['int', 'pointer']);
var gettimeofdayPtr = Module.findExportByName(coreLibraryName, 'gettimeofday');
var gettimeofday = new NativeFunction(gettimeofdayPtr, 'int', ['pointer', 'pointer']);

var clock_gettime_isReal = false;
var gettimeofday_isReal = false;

function speedhack_initializeSpeed(speed) {
  var temptv = Memory.alloc(PS * 2);
  gettimeofday(temptv, ptr(0));
  initial_offset_tod_tv.tv_sec = temptv.readUInt();
  initial_offset_tod_tv.tv_usec = temptv.add(PS).readUInt();
  gettimeofday_isReal = true;
  gettimeofday(temptv, ptr(0));
  gettimeofday_isReal = false;
  initial_time_tod_tv.tv_sec = temptv.readUInt();
  initial_time_tod_tv.tv_usec = temptv.add(PS).readUInt();

  var i;
  for (i = 0; i <= 9; i++) {
    var temptp = Memory.alloc(PS * 3);
    clock_gettime(i, temptp);
    initialclock[i].initialoffset.tv_sec = temptp.readUInt();
    initialclock[i].initialoffset.tv_nsec = temptp.add(PS).readUInt();
    clock_gettime_isReal = true;
    initialclock[i].result = clock_gettime(i, temptp);
    clock_gettime_isReal = false;
    initialclock[i].initialtime.tv_sec = temptp.readUInt();
    initialclock[i].initialtime.tv_nsec = temptp.add(PS).readUInt();
  }

  speedmultiplier = speed;
}

function clock_gettimeHook() {
  Interceptor.attach(clock_gettimePtr, {
    onEnter: function (args) {
      this.clk_id = parseInt(args[0]);
      this.currenttp = args[1];
    },
    onLeave: function (retValue) {
      if (clock_gettime_isReal) return;
      var clk_id = this.clk_id;
      var currenttp = this.currenttp;

      if (this.clk_id <= 9 && initialclock[clk_id].result == 0) {
        var temptp = { tv_sec: 0, tv_nsec: 0 };
        temptp.tv_sec = currenttp.readUInt() - initialclock[clk_id].initialtime.tv_sec;
        temptp.tv_nsec = currenttp.add(PS).readUInt() - initialclock[clk_id].initialtime.tv_nsec;

        if (temptp.tv_nsec < 0) {
          temptp.tv_nsec += 1000000000;
          temptp.tv_sec--;
        }

        var newsec_double = temptp.tv_sec * speedmultiplier;

        var newnsec = Math.floor(temptp.tv_nsec * speedmultiplier);
        var newsec = Math.floor(newsec_double);

        newnsec += Math.floor((newsec_double - Math.floor(newsec_double)) * 1000000000.0);

        newsec += initialclock[clk_id].initialoffset.tv_sec;
        newnsec += initialclock[clk_id].initialoffset.tv_nsec;

        newsec += newnsec / 1000000000;
        newnsec = newnsec % 1000000000;

        if (newnsec < 0) {
          newnsec += 1000000000;
          newsec--;
        }
        newsec = Math.floor(newsec);
        try {
          currenttp.writeUInt(newsec);
          currenttp.add(PS).writeUInt(newnsec);
        } catch (err) {
          console.log(err);
        }
      }
    },
  });
}

function gettimeofdayHook() {
  Interceptor.attach(gettimeofdayPtr, {
    onEnter: function (args) {
      this.tv = args[0];
      this.tz = args[1];
    },
    onLeave: function (retValue) {
      if (gettimeofday_isReal) return;
      var currenttv = this.tv;

      var temptv = { tv_sec: 0, tv_usec: 0 };
      temptv.tv_sec = currenttv.readUInt() - initial_time_tod_tv.tv_sec;
      temptv.tv_usec = currenttv.add(PS).readUInt() - initial_time_tod_tv.tv_usec;

      if (temptv.tv_usec < 0) {
        temptv.tv_usec += 1000000;
        temptv.tv_sec--;
      }

      var newsec_double = temptv.tv_sec * speedmultiplier;

      var newusec = Math.floor(temptv.tv_usec * speedmultiplier);
      var newsec = Math.floor(newsec_double);

      newusec += Math.floor((newsec_double - Math.floor(newsec_double)) * 1000000);

      newsec += initial_offset_tod_tv.tv_sec;
      newusec += initial_offset_tod_tv.tv_usec;

      newsec += newusec / 1000000;
      newusec = newusec % 1000000;

      if (newusec < 0) {
        newusec += 1000000;
        newsec--;
      }

      newsec = Math.floor(newsec);

      currenttv.writeUInt(newsec);
      currenttv.add(PS).writeUInt(newusec);
    },
  });
}

function failure(err) {
  console.error(err.message);
}

var isFirst = true;
function accepted(connection) {
  console.warn('accepted');
  if (isFirst) {
    isFirst = false;
    return;
  }
  var p = connection.input.readAll(1);
  p.then(function (commandBuffer) {
    var command = new Uint8Array(commandBuffer)[0];

    switch (command) {
      case EXTCMD_ALLOC:
        var p2 = connection.input.readAll(12);
        p2.then(function (Buffer) {
          var View = new DataView(Buffer);
          var preferedBase = getUInt64(View, 0, true);
          var size = View.getUint32(8, true);
          if (allocList[preferedBase]) {
            var buf = new ArrayBuffer(8);
            var view = new DataView(buf);
            view.setUint32(0, address & 0x00000000ffffffff, true);
            view.setUint32(4, address & 0xffffffff00000000, true);
            connection.output.writeAll(buf).then().catch(failure);
          } else {
            var mmapPtr = Module.findExportByName(null, 'mmap');
            var mmap = new NativeFunction(mmapPtr, 'pointer', [
              'pointer',
              'int',
              'int',
              'int',
              'int',
              'int',
            ]);
            var ret = mmap(
              new NativePointer(preferedBase),
              size,
              PROT_READ | PROT_WRITE | PROT_EXEC,
              MAP_PRIVATE | MAP_ANONYMOUS,
              -1,
              0
            );
            var address = parseInt(ret);
            if (address != -1) {
              allocList[address] = size;
            }
            var buf = new ArrayBuffer(8);
            var view = new DataView(buf);
            view.setUint32(0, address & 0x00000000ffffffff, true);
            view.setUint32(4, address & 0xffffffff00000000, true);
            connection.output.writeAll(buf).then().catch(failure);
          }
        }).catch(failure);
        break;
      case EXTCMD_FREE:
        var p2 = connection.input.readAll(12);
        p2.then(function (Buffer) {
          var View = new DataView(Buffer);
          var address = getUint64(View, 0, true);
          var size = View.getUint32(8, true);
          var psize = 0;
          var result = 0;
          if (size == 0) {
            if (allocList[address]) {
              psize = allocList[address];
              delete allocList[address];
            } else {
              psize = 0;
            }
          }
          if (psize != 0) {
            var munmapPtr = Module.findExportByName(null, 'munmap');
            var munmap = new NativeFunction(munmapPtr, 'pointer', ['pointer', 'int']);
            var ret = munmap(ptr(address), psize);
            result = parseInt(ret);
            if (result == -1) result = 0;
            else result = 1;
          } else {
            result = 0;
          }
          var buf = new ArrayBuffer(4);
          var view = new DataView(buf);
          view.setUint32(0, 1, true);

          connection.output.writeAll(buf).then().catch(failure);
        }).catch(failure);
        break;
      case EXTCMD_CREATETHREAD:
        var p2 = connection.input.readAll(16);
        p2.then(function (Buffer) {
          var View = new DataView(Buffer);
          var startaddress = getUInt64(View, 0, true);
          var parameter = getUInt64(View, 8, true);
          var pthread_createPtr = Module.findExportByName(null, 'pthread_create');
          var pthread_create = new NativeFunction(pthread_createPtr, 'pointer', [
            'pointer',
            'int',
            'pointer',
            'pointer',
          ]);
          var zero_ptr = Memory.alloc(4);
          var ret = pthread_create(zero_ptr, 0, ptr(startaddress), ptr(parameter));
          var buf = new ArrayBuffer(4);
          var view = new DataView(buf);
          view.setUint32(0, ret, true);

          connection.output.writeAll(buf).then().catch(failure);
        }).catch(failure);
        break;
      case EXTCMD_LOADMODULE:
        break;
      case EXTCMD_SPEEDHACK_SETSPEED:
        var p2 = connection.input.readAll(4);
        p2.then(function (speedBuffer) {
          if (hookFlag == false) {
            clock_gettimeHook();
            gettimeofdayHook();
            hookFlag = true;
          }

          var speedView = new DataView(speedBuffer);
          var speed = speedView.getFloat32(0, true);
          speedhack_initializeSpeed(speed);

          var buf = new ArrayBuffer(4);
          var view = new DataView(buf);
          view.setUint32(0, 1, true);

          connection.output.writeAll(buf).then().catch(failure);
        }).catch(failure);
        break;
    }
  })
    .catch(failure)
    .finally(function () {
      setImmediate(accepted, connection);
    });
}

function accept_loop(listener) {
  var next_iter = accept_loop.bind(null, listener);
  listener
    .accept()
    .then(accepted)
    .catch(failure)
    .finally(function () {
      setImmediate(next_iter);
    });
}

function listened(listener) {
  console.warn('listened');
  accept_loop(listener);
}

function interaction() {
  Socket.listen({
    family: 'unix',
    type: 'abstract',
    path: 'ceserver_extension' + Process.id.toString(),
  })
    .then(listened)
    .catch(failure);
}
interaction();
