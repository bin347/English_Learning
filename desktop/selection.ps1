param([int]$ProbeProcessId = 0, [long]$ProbeHandle = 0)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MouseState {
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
 [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, StringBuilder l, uint flags, uint timeout, out IntPtr result);
 public static string Selected(int handle) {
  var h = new IntPtr(handle); IntPtr r;
  if (SendMessageTimeout(h, 0x00B0, IntPtr.Zero, IntPtr.Zero, 2, 500, out r) == IntPtr.Zero) return null;
  long packed = r.ToInt64(); int start = (int)(packed & 0xffff), end = (int)((packed >> 16) & 0xffff);
  if (end <= start || end - start > 500 || end > 65534) return null;
  var text = new StringBuilder(end + 1);
  if (SendMessageTimeout(h, 0x000D, new IntPtr(text.Capacity), text, 2, 500, out r) == IntPtr.Zero || text.Length < end) return null;
  return text.ToString().Substring(start, end - start);
 }
 public struct POINT { public int X; public int Y; }
}
"@
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Get-Selection($element) {
      $origin = $element
      $pattern = $null
      while ($element -and -not $pattern) {
        $candidate = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$candidate)) { $pattern = $candidate }
        else { $element = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($element) }
      }
      $text = $null
      if ($pattern) {
        $ranges = $pattern.GetSelection()
        if ($ranges.Count -gt 0) {
          $text = $ranges[0].GetText(500).Trim()
        }
      }
      if (-not $text) {
        $native = $origin
        while ($native -and ($native.Current.ClassName -notmatch 'Edit' -or -not $native.Current.NativeWindowHandle)) { $native = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($native) }
        if ($native) { $text = [MouseState]::Selected($native.Current.NativeWindowHandle) }
      }
      $window = $origin
      while ($window -and $window.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) { $window = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($window) }
      $source = if ($window) { $window.Current.Name } else { '' }
      if ($null -eq $text) { $text = '' }
      @{text=$text; source=$source; processId=$origin.Current.ProcessId} | ConvertTo-Json -Compress; [Console]::Out.Flush()
}
if ($ProbeProcessId) {
  $process = Get-Process -Id $ProbeProcessId
  if (-not $ProbeHandle) { $ProbeHandle = $process.MainWindowHandle.ToInt64() }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$ProbeHandle)
  $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  [Console]::Error.WriteLine("root=$($root.Current.Name) descendants=$($elements.Count)")
  $elements = @($root) + @($elements | ForEach-Object { $_ })
  foreach ($element in $elements) {
    $candidate = $null
    $supported = $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$candidate)
    [Console]::Error.WriteLine("control=$($element.Current.ControlType.ProgrammaticName) name=$($element.Current.Name) textPattern=$supported")
    Get-Selection $element
  }
  exit
}
$pressed = $false
while ($true) {
  $down = ([MouseState]::GetAsyncKeyState(1) -band 0x8000) -ne 0
  if ($pressed -and -not $down) {
    Start-Sleep -Milliseconds 100
    try {
      $p = New-Object MouseState+POINT
      [void][MouseState]::GetCursorPos([ref]$p)
      $element = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($p.X, $p.Y)))
      Get-Selection $element
    } catch { }
  }
  $pressed = $down
  Start-Sleep -Milliseconds 100
}



