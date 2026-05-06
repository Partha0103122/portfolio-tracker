$root = $PSScriptRoot
$port = 4173
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()

function Get-ContentType($path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { "text/html" }
    ".css" { "text/css" }
    ".js" { "text/javascript" }
    ".json" { "application/json" }
    ".webmanifest" { "application/manifest+json" }
    ".svg" { "image/svg+xml" }
    default { "application/octet-stream" }
  }
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream)
    $requestLine = $reader.ReadLine()

    while ($reader.Peek() -ge 0) {
      if ([string]::IsNullOrWhiteSpace($reader.ReadLine())) {
        break
      }
    }

    $target = "index.html"
    if ($requestLine -match "^[A-Z]+\s+([^\s]+)") {
      $target = [Uri]::UnescapeDataString($Matches[1].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($target)) {
        $target = "index.html"
      }
    }

    $target = $target.Split("?")[0]
    $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $target))

    if ((-not $fullPath.StartsWith($root)) -or (-not [System.IO.File]::Exists($fullPath))) {
      $status = "404 Not Found"
      $contentType = "text/plain"
      $bytes = [Text.Encoding]::UTF8.GetBytes("Not found")
    } else {
      $status = "200 OK"
      $contentType = Get-ContentType $fullPath
      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    }

    $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
    $stream.Write($header, 0, $header.Length)
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $client.Close()
  }
}
