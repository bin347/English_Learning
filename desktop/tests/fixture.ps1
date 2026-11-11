Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
Add-Type 'using System; using System.Runtime.InteropServices; public static class ShowFixture { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }'
$form = New-Object System.Windows.Forms.Form
$form.ShowInTaskbar = $true
$form.Text = 'UIA selection fixture'
$box = New-Object System.Windows.Forms.RichTextBox
$box.Dock = 'Fill'
$box.Text = 'A small garden grows.'
$form.Controls.Add($box)
$form.Add_Shown({ [void][ShowFixture]::ShowWindow($form.Handle, 5); $box.Focus(); $box.Select(8, 6); Set-Content -Path (Join-Path $PSScriptRoot 'fixture-handle.txt') -Value $box.Handle.ToInt64() })
[void]$form.ShowDialog()

