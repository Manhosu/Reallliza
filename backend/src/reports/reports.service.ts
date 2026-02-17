import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OsStatus } from '../common/types/database.types';
import {
  OsByPeriodDto,
  OsByTechnicianDto,
  OsByPartnerDto,
  ToolsCustodyDto,
  FinancialDto,
  AuditLogDto,
} from './dto';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// Portuguese month abbreviations (0-indexed)
const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // =========================================================================
  // 1. OS by Period
  // =========================================================================

  async generateOsByPeriod(
    filters: OsByPeriodDto,
    format: 'pdf' | 'excel',
  ): Promise<ReportResult> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('service_orders')
      .select(
        `
        order_number,
        title,
        status,
        priority,
        estimated_value,
        created_at,
        technician:profiles!service_orders_technician_id_fkey(full_name),
        partner:partners!service_orders_partner_id_fkey(company_name)
      `,
      )
      .gte('created_at', `${filters.date_from}T00:00:00`)
      .lte('created_at', `${filters.date_to}T23:59:59`)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch OS by period: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate report');
    }

    const rows = (data || []).map((row: any) => ({
      order_number: row.order_number,
      title: row.title,
      status: this.translateStatus(row.status),
      priority: this.translatePriority(row.priority),
      technician: row.technician?.full_name || '-',
      partner: row.partner?.company_name || '-',
      created_at: this.formatDate(row.created_at),
      estimated_value: this.formatCurrency(row.estimated_value),
    }));

    const totalOs = rows.length;
    const totalValue = (data || []).reduce(
      (sum: number, r: any) => sum + (r.estimated_value || 0),
      0,
    );

    const columns = [
      'Número OS',
      'Título',
      'Status',
      'Prioridade',
      'Técnico',
      'Parceiro',
      'Data Criação',
      'Valor Estimado',
    ];
    const keys = [
      'order_number',
      'title',
      'status',
      'priority',
      'technician',
      'partner',
      'created_at',
      'estimated_value',
    ] as const;

    const title = 'Relatório de OS por Período';
    const subtitle = `Período: ${this.formatDate(filters.date_from)} a ${this.formatDate(filters.date_to)}`;
    const footer = `Total OS: ${totalOs} | Valor Total Estimado: ${this.formatCurrency(totalValue)}`;

    if (format === 'excel') {
      return this.generateExcel(title, subtitle, columns, rows, keys as unknown as string[], footer);
    }
    return this.generatePdf(title, subtitle, columns, rows, keys as unknown as string[], footer);
  }

  // =========================================================================
  // 2. OS by Technician
  // =========================================================================

  async generateOsByTechnician(
    filters: OsByTechnicianDto,
    format: 'pdf' | 'excel',
  ): Promise<ReportResult> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('service_orders')
      .select(
        `
        status,
        technician_id,
        technician:profiles!service_orders_technician_id_fkey(full_name)
      `,
      )
      .gte('created_at', `${filters.date_from}T00:00:00`)
      .lte('created_at', `${filters.date_to}T23:59:59`)
      .not('technician_id', 'is', null);

    if (filters.technician_id) {
      query = query.eq('technician_id', filters.technician_id);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch OS by technician: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate report');
    }

    // Group by technician
    const techMap = new Map<
      string,
      { name: string; total: number; completed: number; in_progress: number; cancelled: number }
    >();

    for (const row of data || []) {
      const r = row as any;
      const techName = r.technician?.full_name || 'Sem técnico';
      const techId = r.technician_id || 'unknown';

      if (!techMap.has(techId)) {
        techMap.set(techId, {
          name: techName,
          total: 0,
          completed: 0,
          in_progress: 0,
          cancelled: 0,
        });
      }

      const entry = techMap.get(techId)!;
      entry.total++;
      if (r.status === OsStatus.COMPLETED) entry.completed++;
      if (r.status === OsStatus.IN_PROGRESS) entry.in_progress++;
      if (r.status === OsStatus.CANCELLED) entry.cancelled++;
    }

    const rows = Array.from(techMap.values()).map((t) => ({
      technician: t.name,
      total: String(t.total),
      completed: String(t.completed),
      in_progress: String(t.in_progress),
      cancelled: String(t.cancelled),
      completion_rate:
        t.total > 0 ? `${((t.completed / t.total) * 100).toFixed(1)}%` : '0%',
    }));

    const columns = [
      'Técnico',
      'Total OS',
      'Concluídas',
      'Em Andamento',
      'Canceladas',
      'Taxa Conclusão (%)',
    ];
    const keys = [
      'technician',
      'total',
      'completed',
      'in_progress',
      'cancelled',
      'completion_rate',
    ];

    const title = 'Relatório de OS por Técnico';
    const subtitle = `Período: ${this.formatDate(filters.date_from)} a ${this.formatDate(filters.date_to)}`;

    if (format === 'excel') {
      return this.generateExcel(title, subtitle, columns, rows, keys);
    }
    return this.generatePdf(title, subtitle, columns, rows, keys);
  }

  // =========================================================================
  // 3. OS by Partner
  // =========================================================================

  async generateOsByPartner(
    filters: OsByPartnerDto,
    format: 'pdf' | 'excel',
  ): Promise<ReportResult> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('service_orders')
      .select(
        `
        status,
        estimated_value,
        partner_id,
        partner:partners!service_orders_partner_id_fkey(company_name, cnpj)
      `,
      )
      .gte('created_at', `${filters.date_from}T00:00:00`)
      .lte('created_at', `${filters.date_to}T23:59:59`)
      .not('partner_id', 'is', null);

    if (filters.partner_id) {
      query = query.eq('partner_id', filters.partner_id);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch OS by partner: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate report');
    }

    // Group by partner
    const partnerMap = new Map<
      string,
      {
        name: string;
        cnpj: string;
        total: number;
        completed: number;
        pending: number;
        total_value: number;
      }
    >();

    for (const row of data || []) {
      const r = row as any;
      const partnerId = r.partner_id || 'unknown';
      const partnerName = r.partner?.company_name || 'Sem parceiro';
      const partnerCnpj = r.partner?.cnpj || '-';

      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, {
          name: partnerName,
          cnpj: partnerCnpj,
          total: 0,
          completed: 0,
          pending: 0,
          total_value: 0,
        });
      }

      const entry = partnerMap.get(partnerId)!;
      entry.total++;
      if (r.status === OsStatus.COMPLETED) entry.completed++;
      if (
        r.status === OsStatus.PENDING ||
        r.status === OsStatus.DRAFT ||
        r.status === OsStatus.ASSIGNED
      ) {
        entry.pending++;
      }
      entry.total_value += r.estimated_value || 0;
    }

    const rows = Array.from(partnerMap.values()).map((p) => ({
      partner: p.name,
      cnpj: p.cnpj,
      total: String(p.total),
      completed: String(p.completed),
      pending: String(p.pending),
      total_value: this.formatCurrency(p.total_value),
    }));

    const columns = [
      'Parceiro',
      'CNPJ',
      'Total OS',
      'Concluídas',
      'Pendentes',
      'Valor Total',
    ];
    const keys = ['partner', 'cnpj', 'total', 'completed', 'pending', 'total_value'];

    const title = 'Relatório de OS por Parceiro';
    const subtitle = `Período: ${this.formatDate(filters.date_from)} a ${this.formatDate(filters.date_to)}`;

    if (format === 'excel') {
      return this.generateExcel(title, subtitle, columns, rows, keys);
    }
    return this.generatePdf(title, subtitle, columns, rows, keys);
  }

  // =========================================================================
  // 4. Tools Custody
  // =========================================================================

  async generateToolsCustody(
    _filters: ToolsCustodyDto,
    format: 'pdf' | 'excel',
  ): Promise<ReportResult> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('tool_custody')
      .select(
        `
        checked_out_at,
        condition_out,
        notes,
        tool:tool_inventory!tool_custody_tool_id_fkey(name, serial_number),
        user:profiles!tool_custody_user_id_fkey(full_name),
        service_order:service_orders!tool_custody_service_order_id_fkey(order_number)
      `,
      )
      .is('checked_in_at', null)
      .order('checked_out_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch tools custody: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate report');
    }

    const rows = (data || []).map((row: any) => ({
      tool_name: row.tool?.name || '-',
      serial_number: row.tool?.serial_number || '-',
      technician: row.user?.full_name || '-',
      order_number: row.service_order?.order_number || '-',
      checked_out_at: this.formatDate(row.checked_out_at),
      condition: this.translateCondition(row.condition_out),
    }));

    const columns = [
      'Ferramenta',
      'Num Série',
      'Técnico',
      'OS Vinculada',
      'Data Retirada',
      'Condição',
    ];
    const keys = [
      'tool_name',
      'serial_number',
      'technician',
      'order_number',
      'checked_out_at',
      'condition',
    ];

    const title = 'Relatório de Ferramentas em Custódia';
    const subtitle = `Data de geração: ${this.formatDate(new Date().toISOString())}`;

    if (format === 'excel') {
      return this.generateExcel(title, subtitle, columns, rows, keys);
    }
    return this.generatePdf(title, subtitle, columns, rows, keys);
  }

  // =========================================================================
  // 5. Financial
  // =========================================================================

  async generateFinancial(
    filters: FinancialDto,
    format: 'pdf' | 'excel',
  ): Promise<ReportResult> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('service_orders')
      .select('estimated_value, final_value, created_at, status')
      .gte('created_at', `${filters.date_from}T00:00:00`)
      .lte('created_at', `${filters.date_to}T23:59:59`)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch financial data: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate report');
    }

    const allOrders = data || [];
    const totalOs = allOrders.length;
    const totalEstimated = allOrders.reduce(
      (s: number, r: any) => s + (r.estimated_value || 0),
      0,
    );
    const totalFinal = allOrders.reduce(
      (s: number, r: any) => s + (r.final_value || 0),
      0,
    );
    const ticketMedio = totalOs > 0 ? totalFinal / totalOs : 0;

    // Monthly breakdown
    const monthMap = new Map<
      string,
      { month: string; count: number; estimated: number; final_val: number }
    >();

    for (const row of allOrders) {
      const r = row as any;
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTH_NAMES_PT[d.getMonth()]}/${d.getFullYear()}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { month: label, count: 0, estimated: 0, final_val: 0 });
      }

      const entry = monthMap.get(key)!;
      entry.count++;
      entry.estimated += r.estimated_value || 0;
      entry.final_val += r.final_value || 0;
    }

    const rows = Array.from(monthMap.values()).map((m) => ({
      month: m.month,
      count: String(m.count),
      estimated: this.formatCurrency(m.estimated),
      final_val: this.formatCurrency(m.final_val),
      ticket: m.count > 0 ? this.formatCurrency(m.final_val / m.count) : this.formatCurrency(0),
    }));

    const columns = [
      'Mês',
      'Qtd OS',
      'Valor Estimado',
      'Valor Final',
      'Ticket Médio',
    ];
    const keys = ['month', 'count', 'estimated', 'final_val', 'ticket'];

    const title = 'Relatório Financeiro';
    const subtitle = `Período: ${this.formatDate(filters.date_from)} a ${this.formatDate(filters.date_to)}`;
    const footer =
      `Total OS: ${totalOs} | ` +
      `Valor Estimado Total: ${this.formatCurrency(totalEstimated)} | ` +
      `Valor Final Total: ${this.formatCurrency(totalFinal)} | ` +
      `Ticket Médio: ${this.formatCurrency(ticketMedio)}`;

    if (format === 'excel') {
      return this.generateExcel(title, subtitle, columns, rows, keys, footer);
    }
    return this.generatePdf(title, subtitle, columns, rows, keys, footer);
  }

  // =========================================================================
  // 6. Audit Log
  // =========================================================================

  async generateAuditLog(
    filters: AuditLogDto,
    format: 'pdf' | 'excel',
  ): Promise<ReportResult> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('audit_logs')
      .select(
        `
        created_at,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_id,
        user:profiles!audit_logs_user_id_fkey(full_name)
      `,
      )
      .gte('created_at', `${filters.date_from}T00:00:00`)
      .lte('created_at', `${filters.date_to}T23:59:59`)
      .order('created_at', { ascending: false });

    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters.entity_type) {
      query = query.eq('entity_type', filters.entity_type);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch audit log: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate report');
    }

    const rows = (data || []).map((row: any) => ({
      date: this.formatDateTime(row.created_at),
      user: row.user?.full_name || '-',
      action: row.action || '-',
      entity: `${row.entity_type || '-'} (${row.entity_id || '-'})`,
      ip: row.ip_address || '-',
    }));

    const columns = ['Data', 'Usuário', 'Ação', 'Entidade', 'IP'];
    const keys = ['date', 'user', 'action', 'entity', 'ip'];

    const title = 'Relatório de Auditoria';
    const subtitle = `Período: ${this.formatDate(filters.date_from)} a ${this.formatDate(filters.date_to)}`;

    if (format === 'excel') {
      return this.generateExcel(title, subtitle, columns, rows, keys);
    }
    return this.generatePdf(title, subtitle, columns, rows, keys);
  }

  // =========================================================================
  // PDF Generation (PDFKit)
  // =========================================================================

  private async generatePdf(
    title: string,
    subtitle: string,
    columns: string[],
    rows: Record<string, string>[],
    keys: string[],
    footer?: string,
  ): Promise<ReportResult> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 40,
          bufferPages: true,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const safeTitle = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const timestamp = new Date().toISOString().slice(0, 10);
          resolve({
            buffer,
            filename: `${safeTitle}-${timestamp}.pdf`,
            contentType: 'application/pdf',
          });
        });
        doc.on('error', (err: Error) => reject(err));

        // ----- Header -----
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .text('Reallliza Revestimentos', { align: 'center' });
        doc.moveDown(0.3);
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(title, { align: 'center' });
        doc.moveDown(0.2);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(subtitle, { align: 'center' });
        doc.moveDown(0.8);

        // ----- Table -----
        const tableTop = doc.y;
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidth = pageWidth / columns.length;
        const rowHeight = 20;

        // Header row
        doc.font('Helvetica-Bold').fontSize(8);
        const headerColor = '#2563EB';
        doc
          .rect(
            doc.page.margins.left,
            tableTop,
            pageWidth,
            rowHeight,
          )
          .fill(headerColor);

        columns.forEach((col, i) => {
          doc
            .fillColor('#FFFFFF')
            .text(
              col,
              doc.page.margins.left + i * colWidth + 4,
              tableTop + 5,
              {
                width: colWidth - 8,
                height: rowHeight,
                ellipsis: true,
              },
            );
        });

        // Data rows
        doc.font('Helvetica').fontSize(7).fillColor('#000000');
        let yPos = tableTop + rowHeight;

        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          // Check if we need a new page
          if (yPos + rowHeight > doc.page.height - doc.page.margins.bottom - 30) {
            doc.addPage();
            yPos = doc.page.margins.top;
          }

          // Alternate row background
          if (rowIdx % 2 === 0) {
            doc
              .rect(doc.page.margins.left, yPos, pageWidth, rowHeight)
              .fill('#F3F4F6');
            doc.fillColor('#000000');
          }

          const row = rows[rowIdx];
          keys.forEach((key, i) => {
            doc.text(
              row[key] || '-',
              doc.page.margins.left + i * colWidth + 4,
              yPos + 5,
              {
                width: colWidth - 8,
                height: rowHeight,
                ellipsis: true,
              },
            );
          });

          yPos += rowHeight;
        }

        // ----- Footer -----
        doc.moveDown(1);
        if (footer) {
          // Position after table
          doc.y = yPos + 10;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(footer, {
            align: 'left',
          });
        }

        doc.moveDown(0.5);
        doc.y = Math.max(doc.y, yPos + 10);
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#666666')
          .text(
            `Gerado em: ${this.formatDateTime(new Date().toISOString())}`,
            { align: 'right' },
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // =========================================================================
  // Excel Generation (ExcelJS)
  // =========================================================================

  private async generateExcel(
    title: string,
    subtitle: string,
    columns: string[],
    rows: Record<string, string>[],
    keys: string[],
    footer?: string,
  ): Promise<ReportResult> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Reallliza Revestimentos';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Relatório');

    // ----- Title rows -----
    const titleRow = sheet.addRow(['Reallliza Revestimentos']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells(1, 1, 1, columns.length);

    const subtitleRow = sheet.addRow([title]);
    subtitleRow.font = { bold: true, size: 13 };
    sheet.mergeCells(2, 1, 2, columns.length);

    const periodRow = sheet.addRow([subtitle]);
    periodRow.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    sheet.mergeCells(3, 1, 3, columns.length);

    sheet.addRow([]); // empty spacer row

    // ----- Header row -----
    const headerRow = sheet.addRow(columns);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      };
    });

    // ----- Data rows -----
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const values = keys.map((k) => row[k] || '-');
      const dataRow = sheet.addRow(values);

      if (i % 2 === 0) {
        dataRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF3F4F6' },
          };
        });
      }

      dataRow.eachCell((cell) => {
        cell.font = { size: 9 };
        cell.alignment = { vertical: 'middle' };
      });
    }

    // ----- Footer -----
    if (footer) {
      sheet.addRow([]);
      const footerRow = sheet.addRow([footer]);
      footerRow.font = { bold: true, size: 10 };
      sheet.mergeCells(footerRow.number, 1, footerRow.number, columns.length);
    }

    // Add generation timestamp
    sheet.addRow([]);
    const tsRow = sheet.addRow([
      `Gerado em: ${this.formatDateTime(new Date().toISOString())}`,
    ]);
    tsRow.font = { italic: true, size: 8, color: { argb: 'FF999999' } };
    sheet.mergeCells(tsRow.number, 1, tsRow.number, columns.length);

    // Auto-fit columns (approximate)
    sheet.columns.forEach((col, idx) => {
      let maxLen = columns[idx].length;
      for (const row of rows) {
        const val = row[keys[idx]] || '';
        if (val.length > maxLen) maxLen = val.length;
      }
      col.width = Math.min(Math.max(maxLen + 4, 12), 40);
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const timestamp = new Date().toISOString().slice(0, 10);

    return {
      buffer,
      filename: `${safeTitle}-${timestamp}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  }

  private formatDateTime(dateStr: string): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('pt-BR');
    } catch {
      return dateStr;
    }
  }

  private formatCurrency(value: number | null | undefined): string {
    if (value == null) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private translateStatus(status: string): string {
    const map: Record<string, string> = {
      draft: 'Rascunho',
      pending: 'Pendente',
      assigned: 'Atribuída',
      in_progress: 'Em Andamento',
      paused: 'Pausada',
      completed: 'Concluída',
      cancelled: 'Cancelada',
      rejected: 'Rejeitada',
    };
    return map[status] || status;
  }

  private translatePriority(priority: string): string {
    const map: Record<string, string> = {
      low: 'Baixa',
      medium: 'Média',
      high: 'Alta',
      urgent: 'Urgente',
    };
    return map[priority] || priority;
  }

  private translateCondition(condition: string): string {
    const map: Record<string, string> = {
      new: 'Nova',
      good: 'Boa',
      fair: 'Regular',
      poor: 'Ruim',
      damaged: 'Danificada',
    };
    return map[condition] || condition;
  }
}
