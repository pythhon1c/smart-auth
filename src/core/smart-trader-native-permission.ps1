param([int]$BrowserPid, [string]$ProfilePath, [string]$ExtensionName)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $ae = [System.Windows.Automation.AutomationElement]
  $scope = [System.Windows.Automation.TreeScope]
  function ClassCondition([string]$name) {
    return New-Object System.Windows.Automation.PropertyCondition($ae::ClassNameProperty, $name)
  }
  $pidCondition = New-Object System.Windows.Automation.PropertyCondition($ae::ProcessIdProperty, $BrowserPid)
  function AssertBrowserIdentity {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$BrowserPid"
    if (!$process -or $process.Name -ne 'chrome.exe' -or
        $process.CommandLine -match '(?:^|\s)--type=' -or
        $process.CommandLine -notmatch ('(?:^|\s)(?:"--user-data-dir=' + [regex]::Escape($ProfilePath) + '"|--user-data-dir="' + [regex]::Escape($ProfilePath) + '"|--user-data-dir=' + [regex]::Escape($ProfilePath) + ')(?:\s|$)')) { exit 2 }
  }
  AssertBrowserIdentity
  # Refuse all pre-existing extension prompts, even if they share the name.
  foreach ($window in $ae::RootElement.FindAll($scope::Children, $pidCondition)) {
    if ($window.FindAll($scope::Descendants, (ClassCondition 'ExtensionInstallDialogView')).Count -gt 0) { exit 2 }
  }
  [Console]::Out.WriteLine('SMART_SDA_READY')
  [Console]::Out.Flush()
  if ([Console]::In.ReadLine() -ne 'approve') { exit 2 }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $deadline) {
    # Recheck identity on every iteration, including immediately before Invoke.
    AssertBrowserIdentity
    $windows = $ae::RootElement.FindAll($scope::Children, $pidCondition)
    $candidates = @()
    foreach ($window in $windows) {
      $dialogs = $window.FindAll($scope::Descendants, (ClassCondition 'ExtensionInstallDialogView'))
      foreach ($dialog in $dialogs) {
        $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
        $client = $walker.GetParent($dialog)
        if ($client.Current.ClassName -ne 'DialogClientView') { continue }
        $root = $client
        while ($root -and $root.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) {
          $root = $walker.GetParent($root)
        }
        if (!$root -or $root.Current.ProcessId -ne $BrowserPid -or
            $root.Current.ClassName -ne 'RootView' -or
            !$root.Current.Name.Contains($ExtensionName)) { continue }
        $rows = $client.FindAll($scope::Children, (ClassCondition 'DialogClientView::ButtonRowContainer'))
        if ($rows.Count -ne 1) { continue }
        $buttonCondition = New-Object System.Windows.Automation.PropertyCondition($ae::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
        $buttons = $rows[0].FindAll($scope::Children, $buttonCondition)
        if ($buttons.Count -ne 2) { continue }
        # Chromium DialogClientView creates OK then Cancel on Windows, including
        # RTL locales; tree order is independent of translated labels/geometry.
        # https://chromium.googlesource.com/chromium/src/+/main/ui/views/window/dialog_client_view.cc
        $allow = $buttons[0]
        if ($allow.Current.ClassName -ne 'MdTextButton' -or
            $buttons[1].Current.ClassName -ne 'MdTextButton' -or
            !$allow.Current.IsEnabled -or $allow.Current.IsOffscreen -or
            !$buttons[1].Current.IsEnabled) { continue }
        $candidates += $allow
      }
    }
    if ($candidates.Count -gt 1) { exit 2 }
    if ($candidates.Count -eq 1) {
      AssertBrowserIdentity
      if (!$candidates[0].Current.IsEnabled -or $candidates[0].Current.IsOffscreen -or
          $candidates[0].Current.ProcessId -ne $BrowserPid) { exit 2 }
      $invoke = $candidates[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $invoke.Invoke()
      exit 0
    }
    Start-Sleep -Milliseconds 200
  }
} catch { exit 2 }
exit 3
