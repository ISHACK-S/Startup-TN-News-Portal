const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Unable to connect to the StartupTN News service.', 0);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('The service returned an unexpected response.', response.status);
  }

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('startuptn:session-expired'));
    }
    throw new ApiError(
      payload?.error?.message || 'The request could not be completed.',
      response.status,
      payload?.error?.details
    );
  }

  return payload;
}

export function uploadImage(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_URL}/admin/uploads`);
    request.withCredentials = true;
    request.setRequestHeader('Accept', 'application/json');
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let payload;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new ApiError('The service returned an unexpected response.', request.status));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        if (request.status === 401) {
          window.dispatchEvent(new CustomEvent('startuptn:session-expired'));
        }
        reject(new ApiError(
          payload?.error?.message || 'The image could not be uploaded.',
          request.status,
          payload?.error?.details
        ));
        return;
      }
      resolve(payload.data);
    });
    request.addEventListener('error', () => {
      reject(new ApiError('The image upload could not reach the server.', 0));
    });
    request.addEventListener('abort', () => {
      reject(new ApiError('The image upload was cancelled.', 0));
    });
    const data = new FormData();
    data.append('image', file);
    request.send(data);
  });
}
