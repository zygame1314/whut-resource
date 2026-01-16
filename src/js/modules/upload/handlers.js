function compressImage(file, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function () {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1920;
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas 转换为 Blob 失败'));
                    }
                }, file.type, quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}
function addWatermarkToPDF(file) {
    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();
            let watermarkText = 'WHUT Share';
            const fontSize = 50;
            const opacity = 0.3;
            pages.forEach(page => {
                const { width, height } = page.getSize();
                page.drawText(watermarkText, {
                    x: width / 2 - (watermarkText.length * fontSize) / 4,
                    y: height / 2,
                    size: fontSize,
                    font: helveticaFont,
                    color: PDFLib.rgb(0.7, 0.7, 0.7),
                    opacity: opacity,
                    rotate: PDFLib.degrees(45),
                });
            });
            const pdfBytes = await pdfDoc.save();
            const watermarkedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            resolve(watermarkedBlob);
        } catch (error) {
            console.error('PDF水印添加失败:', error);
            resolve(file);
        }
    });
}
function validateFile(file) {
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { valid: false, message: `文件 "${file.name}" 大小超过 100MB 限制` };
    }
    return { valid: true };
}
