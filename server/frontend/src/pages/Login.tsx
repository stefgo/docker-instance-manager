import { useState, useEffect } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../utils';
import { useTheme } from '../features/app/context/ThemeContext';
import { LoginPage } from '@stefgo/react-ui-components';

export default function Login() {
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [authType, setAuthType] = useState<'local' | 'oidc' | null>(null);
    const { login } = useAuth();
    const [searchParams] = useSearchParams();
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const token = searchParams.get('token');
        if (token) login(token);
    }, [searchParams, login]);

    useEffect(() => {
        fetch('/api/auth/config')
            .then(res => res.json())
            .then(data => setAuthType(data.type))
            .catch(() => setAuthType('local'));
    }, []);

    const handleLogin = async (username: string, password: string) => {
        setError('');
        setIsLoading(true);
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');
            login(data.token);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LoginPage
            title="Docker"
            titleHighlight="Instance"
            subtitle="Manager"
            authType={authType}
            error={error}
            isLoading={isLoading}
            onLogin={handleLogin}
            onOidcLogin={() => { window.location.href = '/api/auth/login'; }}
            theme={theme}
            onToggleTheme={toggleTheme}
        />
    );
}
