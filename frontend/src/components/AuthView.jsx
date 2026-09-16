import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/api';

export default function AuthView({ onAuthSuccess }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Validación de política de contraseñas institucional
  const hasMinLength = password.length >= 6;
  const hasMaxLength = password.length > 0 && password.length <= 16;
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9\s]/.test(password);
  const isPasswordValid = hasMinLength && hasMaxLength && hasNumber && hasSymbol;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (tab === 'register') {
        if (!isPasswordValid) {
          setError('La contraseña debe cumplir con la política institucional (máx 16 caracteres, mín 1 número y 1 símbolo).');
          setLoading(false);
          return;
        }
        await registerUser(usuario.trim(), nombre.trim(), password);
        setSuccessMsg('Cuenta de analista registrada exitosamente. Iniciando sesión...');
        const loginRes = await loginUser(usuario.trim(), password);
        onAuthSuccess(loginRes.usuario);
      } else {
        const loginRes = await loginUser(usuario.trim(), password);
        onAuthSuccess(loginRes.usuario);
      }
    } catch (err) {
      setError(err.message || 'Error al autenticar analista.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="canvas-auth-wrapper">
      <div className="auth-card-embedded">
        <div className="auth-header">
          <div className="auth-logo-badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2>ComplianceAI</h2>
          <p>Asistente de regulación y riesgos. Identificación de analista para sesiones privadas, trazabilidad y auditoría.</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setTab('login');
              setError(null);
              setSuccessMsg(null);
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => {
              setTab('register');
              setError(null);
              setSuccessMsg(null);
            }}
          >
            Registrarse
          </button>
        </div>

        {error && (
          <div className="auth-error-alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ minWidth: 16 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            background: 'var(--status-high-bg)',
            border: '1px solid var(--status-high-border)',
            color: 'var(--status-high-text)',
            padding: '0.65rem 0.9rem',
            borderRadius: '14px',
            fontSize: '0.82rem'
          }}>
            {successMsg}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label">Nombre Completo del Analista</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej. Rodrigo Torres"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                id="input-auth-nombre"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Usuario / Identificador</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. analista_sbs"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              id="input-auth-usuario"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              maxLength={16}
              onChange={(e) => setPassword(e.target.value)}
              required
              id="input-auth-password"
            />
          </div>

          {tab === 'register' && (
            <div className="password-policy-box">
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                Requisitos de Seguridad Institucional:
              </div>
              <div className={`policy-item ${hasMaxLength && hasMinLength ? 'met' : ''}`}>
                <span>{hasMaxLength && hasMinLength ? '✓' : '○'}</span>
                <span>Entre 6 y 16 caracteres</span>
              </div>
              <div className={`policy-item ${hasNumber ? 'met' : ''}`}>
                <span>{hasNumber ? '✓' : '○'}</span>
                <span>Mínimo 1 número (0-9)</span>
              </div>
              <div className={`policy-item ${hasSymbol ? 'met' : ''}`}>
                <span>{hasSymbol ? '✓' : '○'}</span>
                <span>Mínimo 1 símbolo especial (!@#$%^&*)</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="submit-btn"
            disabled={loading || (tab === 'register' && !isPasswordValid)}
            id="btn-auth-submit"
          >
            {loading ? 'Procesando...' : tab === 'login' ? 'Ingresar al Asistente' : 'Crear Cuenta Segura'}
          </button>
        </form>
      </div>
    </div>
  );
}
