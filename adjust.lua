local oldchange=MainForm.cbSpeedhack.OnChange
MainForm.cbSpeedhack.OnChange=function(Sender)
  waitforsymbols()
  
  local a = getAddress("gettimeofday");
  registerSymbol("real_gettimeofday",a);
  local b = getAddress("clock_gettime");
  registerSymbol("real_clock_gettime",b);  

  if oldchange then
    oldchange(Sender)
  end
end