$ErrorActionPreference = 'Stop'
foreach ($module in @('Microsoft.PowerShell.Utility','Microsoft.PowerShell.Management','CimCmdlets')) {
  Import-Module ([IO.Path]::Combine($PSHOME,'Modules',$module,($module + '.psd1')))
}
$config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine())) | ConvertFrom-Json
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class BrowserShellBranding {
  static long leaseTicks;
  static volatile bool pipeEnded;
  public static void StartPipe() {
    System.Threading.Interlocked.Exchange(ref leaseTicks,DateTime.UtcNow.AddSeconds(20).Ticks);
    var reader = new System.Threading.Thread(() => {
      try { while (Console.In.ReadLine() == "alive") System.Threading.Interlocked.Exchange(ref leaseTicks,DateTime.UtcNow.AddSeconds(20).Ticks); }
      finally { pipeEnded=true; }
    }); reader.IsBackground=true; reader.Start();
  }
  public static bool PipeAlive() { return !pipeEnded && DateTime.UtcNow.Ticks < System.Threading.Interlocked.Read(ref leaseTicks); }
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder name, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] struct Key { public Guid format; public uint id; }
  [StructLayout(LayoutKind.Explicit, Size=24)] struct Value { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr text; [FieldOffset(8)] public short boolean; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Store { void GetCount(out uint n); void GetAt(uint n, out Key key); void GetValue(ref Key key, out Value value); void SetValue(ref Key key, ref Value value); void Commit(); }
  [DllImport("shell32.dll", PreserveSig=false)] static extern void SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out Store store);
  [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")] class Taskbar {}
  [ComImport, Guid("EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Taskbar3 {
    void HrInit(); void AddTab(IntPtr h); void DeleteTab(IntPtr h); void ActivateTab(IntPtr h); void SetActiveAlt(IntPtr h);
    void MarkFullscreenWindow(IntPtr h, [MarshalAs(UnmanagedType.Bool)] bool full);
    void SetProgressValue(IntPtr h, ulong done, ulong total); void SetProgressState(IntPtr h, uint state);
    void RegisterTab(IntPtr tab, IntPtr parent); void UnregisterTab(IntPtr h); void SetTabOrder(IntPtr h, IntPtr before); void SetTabActive(IntPtr h, IntPtr parent, uint flags);
    void ThumbBarAddButtons(IntPtr h, uint n, IntPtr buttons); void ThumbBarUpdateButtons(IntPtr h, uint n, IntPtr buttons); void ThumbBarSetImageList(IntPtr h, IntPtr list);
    void SetOverlayIcon(IntPtr h, IntPtr icon, [MarshalAs(UnmanagedType.LPWStr)] string description);
    void SetThumbnailTooltip(IntPtr h, [MarshalAs(UnmanagedType.LPWStr)] string text);
  }
  public static bool Owned(IntPtr h, uint pid) {
    uint actual; GetWindowThreadProcessId(h,out actual);
    var name = new StringBuilder(256); GetClassName(h,name,name.Capacity);
    return actual == pid && GetWindow(h,4) == IntPtr.Zero && name.ToString() == "Chrome_WidgetWin_1";
  }
  public static IntPtr[] Windows(uint pid) {
    var windows = new List<IntPtr>(); EnumWindows((h,d) => { if (IsWindowVisible(h) && Owned(h,pid)) windows.Add(h); return windows.Count < 64; },IntPtr.Zero);
    return windows.ToArray();
  }
  public static string Title(IntPtr h) { var title = new StringBuilder(1024); GetWindowText(h,title,title.Capacity); return title.ToString(); }
  static void Set(Store store, uint id, string text) {
    var key = new Key { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id = id };
    var value = new Value { type = 31, text = Marshal.StringToCoTaskMemUni(text) };
    try { store.SetValue(ref key,ref value); } finally { Marshal.FreeCoTaskMem(value.text); }
  }
  public static void Apply(IntPtr h, uint pid, string appId, string icon, string display) {
    if (!Owned(h,pid)) return;
    Store store; var iid = typeof(Store).GUID; SHGetPropertyStoreForWindow(h,ref iid,out store);
    try {
      // This shell hint precedes the explicit ID. Explorer versions may still
      // offer pinning; it is presentation metadata, not an access control.
      var key = new Key { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id = 9 };
      var prevent = new Value { type=11, boolean=-1 }; store.SetValue(ref key,ref prevent);
      Set(store,3,icon+",0"); Set(store,4,display); Set(store,5,appId); store.Commit();
    } finally { Marshal.ReleaseComObject(store); }
    if (!Owned(h,pid)) return;
    try { var taskbar = (Taskbar3)new Taskbar(); try { taskbar.HrInit(); taskbar.SetThumbnailTooltip(h,display); } finally { Marshal.ReleaseComObject(taskbar); } } catch (COMException) {}
  }
}
'@
$browser = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$config.pid)
$profile = [regex]::Escape([string]$config.profilePath)
if (!$browser -or $browser.Name -ne 'chrome.exe' -or $browser.ExecutablePath -ine $config.executablePath -or
    $browser.CommandLine -match '(?:^|\s)--type=' -or
    $browser.CommandLine -notmatch ('(?:^|\s)(?:"--user-data-dir=' + $profile + '"|--user-data-dir="' + $profile + '"|--user-data-dir=' + $profile + ')(?:\s|$)')) { exit 2 }
$browserProcess = Get-Process -Id $config.pid
$parentProcess = Get-Process -Id $config.parentPid
# Access handles now, pinning the exact process objects across PID reuse.
$null = $browserProcess.Handle; $null = $parentProcess.Handle
if ([Math]::Abs(($browserProcess.StartTime.ToUniversalTime() - $browser.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1) { exit 2 }
if ([IO.File]::Exists($config.iconPath) -and (([IO.File]::GetAttributes($config.iconPath) -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { exit 2 }
if (!(Test-Path -LiteralPath $config.iconPath -PathType Leaf)) {
  $frames = @(); $sizes = @(16,20,24,32,40,48,64,128,256)
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$config.appId))
  $palette = @('#1D4ED8','#6D28D9','#0F766E','#B45309','#BE123C','#4338CA','#047857','#A21CAF')
  $background = [Drawing.ColorTranslator]::FromHtml($palette[$hash[0] % $palette.Count])
  $letters = ([string]$config.displayName).Substring(0,[Math]::Min(2,$config.displayName.Length)).ToUpperInvariant()
  foreach ($size in $sizes) {
    $bitmap = New-Object Drawing.Bitmap $size,$size
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $font = New-Object Drawing.Font 'Segoe UI',([single]($size * 0.49)),([Drawing.FontStyle]::Bold),([Drawing.GraphicsUnit]::Pixel)
    $format = New-Object Drawing.StringFormat
    $stream = New-Object IO.MemoryStream
    try {
      $graphics.Clear($background); $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
      $format.Alignment = [Drawing.StringAlignment]::Center; $format.LineAlignment = [Drawing.StringAlignment]::Center
      $graphics.DrawString($letters,$font,[Drawing.Brushes]::White,([Drawing.RectangleF]::new(0,0,$size,$size)),$format)
      $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
      $frames += ,$stream.ToArray()
    } finally { $stream.Dispose(); $format.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
  }
  $temporary = [string]$config.iconPath + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  $writer = New-Object IO.BinaryWriter ([IO.File]::Open($temporary,[IO.FileMode]::CreateNew))
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i=0;$i -lt $sizes.Count;$i++) {
      $edge = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
      $writer.Write([byte]$edge); $writer.Write([byte]$edge); $writer.Write([uint16]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
      $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
  } finally { $writer.Dispose() }
  try { [IO.File]::Move($temporary,[string]$config.iconPath) } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
}
[BrowserShellBranding]::StartPipe()
$seen = @{}
try { while ([BrowserShellBranding]::PipeAlive() -and !$browserProcess.HasExited -and !$parentProcess.HasExited) {
  $current = @{}
  foreach ($window in [BrowserShellBranding]::Windows($config.pid)) {
    $key = $window.ToInt64().ToString(); $title = [BrowserShellBranding]::Title($window); $current[$key] = $title
    if (!$seen.ContainsKey($key) -or $seen[$key] -ne $title) {
      try { [BrowserShellBranding]::Apply($window,$config.pid,$config.appId,$config.iconPath,$config.displayName) } catch { $current.Remove($key) }
    }
  }
  $seen = $current
  Start-Sleep -Milliseconds 1000
} } finally { $browserProcess.Dispose(); $parentProcess.Dispose() }
