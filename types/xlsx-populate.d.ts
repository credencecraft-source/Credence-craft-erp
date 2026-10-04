declare module "xlsx-populate" {
  interface CellStyle {
    bold?: boolean;
    fill?: string;
    numberFormat?: string;
    horizontalAlignment?: string;
  }

  type DataValidation = {
    type: "list" | "whole" | "decimal" | "date";
    allowBlank: boolean;
    operator?: "between" | "greaterThan" | "greaterThanOrEqual";
    showErrorMessage?: boolean;
    showInputMessage?: boolean;
    promptTitle?: string;
    prompt?: string;
    errorTitle?: string;
    error?: string;
    formula1: string | number;
    formula2?: string | number;
  };

  interface Cell {
    value(): unknown;
    value(value: unknown): Cell;
    style(name: string): unknown;
    style(style: CellStyle): Cell;
    formula(): string | undefined;
    formula(formula: string): Cell;
    dataValidation(validation?: DataValidation): DataValidation | false | undefined;
  }

  interface Range {
    value(): unknown;
    value(values: unknown): Range;
    style(style: CellStyle): Range;
    style(styleName: "numberFormat", value: string): Range;
    dataValidation(): DataValidation | false | undefined;
    dataValidation(validation: DataValidation): Range;
  }

  interface Column {
    width(width: number): Column;
    hidden(): boolean | string;
    hidden(hidden: boolean): Column;
  }

  export interface Sheet {
    name(name: string): Sheet;
    cell(address: string): Cell;
    range(address: string): Range;
    column(column: string): Column;
    freezePanes(rows: number, columns: number): Sheet;
    hidden(): boolean | string;
    hidden(hidden: boolean): Sheet;
  }

  export interface Workbook {
    sheet(indexOrName: number | string): Sheet;
    addSheet(name: string): Sheet;
    definedName(name: string): string | undefined;
    definedName(name: string, refersTo: string | Range): Workbook;
    outputAsync(options?: { type: "nodebuffer" }): Promise<Buffer>;
  }

  const XlsxPopulate: {
    fromBlankAsync(): Promise<Workbook>;
    fromDataAsync(data: ArrayBuffer | Uint8Array): Promise<Workbook>;
  };

  export default XlsxPopulate;
}
