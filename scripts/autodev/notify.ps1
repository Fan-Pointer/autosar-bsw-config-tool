param([string]$Message)
# Best-effort local notification. The durable attention.json is authoritative if Windows suppresses balloons.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notification = New-Object System.Windows.Forms.NotifyIcon
try {
    $notification.Icon = [System.Drawing.SystemIcons]::Information
    $notification.Visible = $true
    $notification.BalloonTipTitle = 'AUTOSAR AutoDev'
    $notification.BalloonTipText = $Message
    $notification.ShowBalloonTip(5000)
    Start-Sleep -Seconds 6
} finally { $notification.Dispose() }
