from pathlib import Path

import qrcode


BASE_URL = "https://cards.onesmarter.com"

OUTPUT_FOLDER = Path("qr-codes-production")
OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

QR_URLS = {
    # Default/current card experience
    "postcard-a-qr-production.png":
        f"{BASE_URL}/",

    # Postcard A A/B-test experience
    "postcard-a-qra-production.png":
        f"{BASE_URL}/a",

    # Postcard B experience
    "postcard-b-qrb-production.png":
        f"{BASE_URL}/b",
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
