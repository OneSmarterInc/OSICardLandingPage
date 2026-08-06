from pathlib import Path

import qrcode


BASE_URL = "https://qr-scan-med.vercel.app/practices"

OUTPUT_FOLDER = Path("qr-codes-production")
OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

QR_URLS = {
    # Current/older Postcard A tag
    "postcard-a-qr-production.png":
        f"{BASE_URL}?s=qr",

    # Future Postcard A A/B-test tag
    "postcard-a-qra-production.png":
        f"{BASE_URL}?s=qra",

    # Postcard B tag
    "postcard-b-qrb-production.png":
        f"{BASE_URL}?s=qrb",
}


for filename, url in QR_URLS.items():
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=14,
        border=4,
    )

    qr.add_data(url)
    qr.make(fit=True)

    image = qr.make_image(
        fill_color="black",
        back_color="white",
    )

    output_path = OUTPUT_FOLDER / filename
    image.save(output_path)

    print(f"Created: {output_path}")
    print(f"URL: {url}")
    print()