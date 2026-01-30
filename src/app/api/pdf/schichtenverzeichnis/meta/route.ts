import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

const TEMPLATE_FILES = ["SV_1.pdf", "SV_2.pdf"] as const;

export async function GET() {
  try {
    const pages = [];

    for (const fileName of TEMPLATE_FILES) {
      const templatePath = path.join(process.cwd(), "public", "templates", fileName);
      if (!fs.existsSync(templatePath)) {
        return NextResponse.json(
          { error: `Template PDF not found at: ${templatePath}` },
          { status: 500 }
        );
      }

      const bytes = fs.readFileSync(templatePath);
      const doc = await PDFDocument.load(bytes);
      const page = doc.getPages()[0];
      pages.push({
        file: fileName,
        width: page.getWidth(),
        height: page.getHeight(),
        rotation: page.getRotation().angle,
      });
    }

    return NextResponse.json({ pages });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
