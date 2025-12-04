'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Download } from 'lucide-react';

interface QRCodeGeneratorProps {
  qrCode: string;
  elderlyName: string;
}

export default function QRCodeGenerator({ qrCode, elderlyName }: QRCodeGeneratorProps) {
  // QR code does NOT include secret token - only the qr_code
  // When no secret is present, geolocation becomes MANDATORY
  const checkInUrl = `${process.env.NEXT_PUBLIC_APP_URL}/checkin?qr_code=${qrCode}`;

  const downloadQRCode = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      ctx?.drawImage(img, 0, 0, 400, 400);

      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `qr-code-${elderlyName.replace(/\s+/g, '-')}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold text-gray-800">{elderlyName}</h3>
      <div className="p-4 bg-white border-4 border-gray-200 rounded-lg">
        <QRCodeSVG
          id="qr-code-svg"
          value={checkInUrl}
          size={256}
          level="H"
          includeMargin
        />
      </div>
      <a
        href={checkInUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 hover:underline text-center max-w-xs break-all"
      >
        {checkInUrl}
      </a>
      <button
        onClick={downloadQRCode}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Download size={20} />
        Download QR Code
      </button>
    </div>
  );
}
