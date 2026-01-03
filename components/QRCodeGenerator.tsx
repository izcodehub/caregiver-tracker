'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Download } from 'lucide-react';

interface QRCodeGeneratorProps {
  qrCode: string;
  elderlyName: string;
  language?: 'fr' | 'en';
}

export default function QRCodeGenerator({ qrCode, elderlyName, language = 'fr' }: QRCodeGeneratorProps) {
  // QR code does NOT include secret token - only the qr_code
  // When no secret is present, geolocation becomes MANDATORY
  const checkInUrl = `${process.env.NEXT_PUBLIC_APP_URL}/checkin?qr_code=${qrCode}&method=qr`;

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
    <div className="flex flex-col items-center gap-4 w-full">
      <h3 className="text-xl font-semibold text-gray-800 text-center">{elderlyName}</h3>
      <div className="p-2 sm:p-4 bg-white border-2 sm:border-4 border-gray-200 rounded-lg max-w-full">
        <QRCodeSVG
          id="qr-code-svg"
          value={checkInUrl}
          size={200}
          level="H"
          includeMargin
          className="w-full h-auto max-w-[200px] sm:max-w-[256px]"
        />
      </div>
      <button
        onClick={downloadQRCode}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
      >
        <Download size={18} />
        <span className="whitespace-nowrap">
          {language === 'fr' ? 'Télécharger QR' : 'Download QR'}
        </span>
      </button>
    </div>
  );
}
