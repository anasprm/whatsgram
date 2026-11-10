export interface ExportPayload {
  version: string;
  timestamp: string;
  chatsCount: number;
  data: string; // Base64 encoded JSON string
}

export const generateSovereignExport = async (
  userId: string,
  rawChats: Record<string, unknown>[]
): Promise<Blob> => {
  const payload: ExportPayload = {
    version: "1.0.0-sovereign",
    timestamp: new Date().toISOString(),
    chatsCount: rawChats.length,
    data: btoa(unescape(encodeURIComponent(JSON.stringify(rawChats)))),
  };

  const jsonString = JSON.stringify(payload, null, 2);
  return new Blob([jsonString], { type: "application/json" });
};

export const triggerDownload = (blob: Blob, filename = "relay-sovereign-backup.json") => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
