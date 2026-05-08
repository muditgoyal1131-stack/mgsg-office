import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface AuthUser {
  id: number;
  email: string;
  role: string;
  staffName?: string;
  staffId?: number;
  isPartner?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isHR: boolean;
  isPartner: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios
        .get('/api/auth/profile')
        .then((res) => {
          setUser({
            id: res.data.id,
            email: res.data.email,
            role: res.data.role,
            staffName: res.data.staff?.staffName,
            staffId: res.data.staffId,
            isPartner: res.data.isPartner ?? res.data.staff?.isPartner ?? false,
          });
        })
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await axios.post('/api/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, token, login, logout, loading,
      isAdmin: user?.role === 'ADMIN',
      isHR: user?.role === 'HR' || user?.role === 'ADMIN',
      isPartner: user?.isPartner ?? false,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
