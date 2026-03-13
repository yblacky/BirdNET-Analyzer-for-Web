async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || data.error || "Request failed");
  }

  return data;
}

export async function getLanguages() {
  return fetchJson("/api/meta/languages");
}

export async function getAppConfig() {
  return fetchJson("/api/meta/config");
}

export async function createJob(formData) {
  return fetchJson("/api/jobs", {
    method: "POST",
    body: formData,
  });
}

export async function getJob(jobId) {
  return fetchJson(`/api/jobs/${jobId}`);
}