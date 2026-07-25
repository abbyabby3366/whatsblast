import ky from 'ky';

const api = ky.create({
  baseUrl: 'http://127.0.0.1:22553',
  hooks: {
    beforeRequest: [
      request => {
        const token = null;
        if (token) {
          request.request.headers.set('Authorization', `Bearer ${token}`);
        }
      }
    ]
  }
});

api.post('login/', { json: { test: true } }).catch(e => console.log('Error:', e.message));
