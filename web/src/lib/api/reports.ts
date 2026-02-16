import { getAccessToken, BASE_URL } from './client';

export const reportsApi = {
  // Download report as file (PDF or Excel)
  async download(reportType: string, params: Record<string, string>): Promise<void> {
    const token = await getAccessToken();
    const queryString = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/reports/${reportType}?${queryString}`;

    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download report: ${response.statusText}`);
    }

    // Get filename from Content-Disposition header or generate one
    const disposition = response.headers.get('Content-Disposition');
    const filename = disposition?.match(/filename="(.+)"/)?.[1] || `relatorio-${reportType}.pdf`;

    // Download the blob
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  },
};
