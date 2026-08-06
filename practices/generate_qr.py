from pathlib import Path

import qrcode


OUTPUT_FOLDER = Path("qr-codes")
OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

QR_URLS = {
    "postcard-a-qra.png":
        "http://10.0.6.84:8000/practices/?s=qra",

    "postcard-b-qrb.png":
        "http://10.0.6.84:8000/practices/?s=qrb",
}


for filename, url in QR_URLS.items():
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
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