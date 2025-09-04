// Toggle senha
document.querySelector('.toggle-password').addEventListener('click', function () {
    const pwd = document.getElementById('password');
    const icon = this.querySelector('svg');
    if (pwd.type === 'password') {
      pwd.type = 'text';
      icon.innerHTML = `
        <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
        <circle cx="12" cy="12" r="2.5"/>
      `;
    } else {
      pwd.type = 'password';
      icon.innerHTML = `
        <path d="M1 1l22 22m0-22L1 23" stroke="#00BFFF" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7z" fill="none" stroke="#00BFFF" stroke-width="2"/>
        <circle cx="12" cy="12" r="3" fill="none" stroke="#00BFFF" stroke-width="2"/>
      `;
    }
  });
  
  // Login Form
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
  
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const mfa = document.getElementById('mfaCode')?.value || '';
  
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password: pass, mfa }),
    });
  
    const data = await res.json();
  
    if (data.error) {
      alert('Erro: ' + data.error);
      if (data.mfa_required) {
        document.getElementById('mfaContainer').style.display = 'block';
      }
    } else {
      // Salva o auth token do Zabbix
      localStorage.setItem('zabbix_auth', data.auth);
      window.location.href = '/dashboard.html'; // Redireciona para dashboard
    }
  });