import { useState, FormEvent, useEffect } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../utils';
import { useTheme } from '../features/app/context/ThemeContext';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const [searchParams] = useSearchParams();
    const [authType, setAuthType] = useState<'local' | 'oidc' | null>(null);
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            login(token);
        }
    }, [searchParams, login]);

    useEffect(() => {
        fetch('/api/auth/config')
            .then(res => res.json())
            .then(data => setAuthType(data.type))
            .catch(() => setAuthType('local'));
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
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

    const handleOidcLogin = () => {
        window.location.href = '/api/auth/login';
    };

    if (authType === null) {
        return <div className="min-h-screen bg-dark flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-dark p-4 text-text-primary font-sans">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-dark/40 via-dark to-black opacity-70 z-0"></div>

            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-card dark:bg-card-dark border border-border dark:border-border-dark text-text-secondary dark:text-text-secondary-dark hover:bg-hover dark:hover:bg-hover-dark transition-all"
                aria-label="Toggle theme"
            >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="w-full max-w-md glass-card relative z-10 overflow-hidden animate-fade-in shadow-2xl">
                <div className="h-1 w-full bg-gradient-to-r from-primary to-primary-hover"></div>

                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-dark to-dark mb-4 shadow-inner border border-white/5 animate-pulse-soft">
                            <Lock className="w-10 h-10 text-primary drop-shadow-glow-accent animate-pulse-glow" />
                        </div>
                        <h2 className="text-3xl font-extrabold tracking-tight text-text-primary dark:text-text-primary-dark mb-1">Docker <span className="text-primary">Instance</span></h2>
                        <p className="text-text-muted text-xs uppercase tracking-[0.3em] font-bold opacity-80">Manager</p>
                    </div>

                    {authType === 'oidc' ? (
                        <div className="space-y-6">
                            <div className="bg-dark border border-border-dark rounded-lg p-6 text-center">
                                <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-text-primary dark:text-text-primary-dark mb-2">Single Sign-On Enabled</h3>
                                <p className="text-text-muted dark:text-text-muted-dark text-sm mb-6">Please log in using your identity provider.</p>

                                <button
                                    onClick={handleOidcLogin}
                                    className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all shadow-glow-accent hover:shadow-primary/20 active:scale-[0.98]"
                                >
                                    Login with OIDC
                                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="bg-red-900/20 border border-red-800/50 text-red-200 text-sm p-4 rounded-lg flex items-start gap-3 animate-pulse-soft">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="group">
                                    <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5 ml-1 group-focus-within:text-primary transition-colors">Username</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <User className="h-5 w-5 text-text-muted group-focus-within:text-primary transition-colors" />
                                        </div>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="block w-full pl-10 pr-3 py-2.5 bg-input-bg dark:bg-input-bg-dark border border-border dark:border-border-dark rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all sm:text-sm"
                                            placeholder="Enter your username"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="group">
                                    <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5 ml-1 group-focus-within:text-primary transition-colors">Password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-text-muted group-focus-within:text-primary transition-colors" />
                                        </div>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="block w-full pl-10 pr-3 py-2.5 bg-input-bg dark:bg-input-bg-dark border border-border dark:border-border-dark rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all sm:text-sm"
                                            placeholder="••••••••"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-accent hover:shadow-primary/20 active:scale-[0.98]"
                            >
                                {isLoading ? 'Signing in...' : 'Sign in to Dashboard'}
                                {!isLoading && <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
