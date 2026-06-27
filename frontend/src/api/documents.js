import client from "./client";

export const uploadDocument = (courseId, file) => {
  const formData = new FormData();
  formData.append("file", file);

  return client.post(`/documents/${courseId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const listDocuments = (courseId) =>
  client.get(`/documents/${courseId}`);

export const deleteDocument = (courseId, documentId) =>
  client.delete(`/documents/${courseId}/${documentId}`);

export const viewDocument = async (courseId, documentId) => {
  try {
    const response = await client.get(
      `/documents/${courseId}/${documentId}/download`,
      {
        responseType: "blob",
      }
    );

    const blobUrl = window.URL.createObjectURL(
      new Blob([response.data], { type: "application/pdf" })
    );

    window.open(blobUrl, "_blank");
  } catch (err) {
    alert(
      err.response?.status === 404
        ? "File not found."
        : "Couldn't open this file."
    );
  }
};

export const downloadDocument = async (
  courseId,
  documentId,
  filename
) => {
  try {
    const response = await client.get(
      `/documents/${courseId}/${documentId}/download`,
      {
        responseType: "blob",
      }
    );

    const url = window.URL.createObjectURL(
      new Blob([response.data])
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(
      err.response?.status === 404
        ? "File not found."
        : "Couldn't download this file."
    );
  }
};