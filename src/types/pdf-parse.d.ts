declare module "pdf-parse" {
  interface PDFParseResult {
    text: string;
    numpages?: number;
    numrender?: number;
    info?: any;
    metadata?: any;
    version?: string;
  }

  function pdfParse(data: Buffer | Uint8Array): Promise<PDFParseResult>;

  export default pdfParse;
}
