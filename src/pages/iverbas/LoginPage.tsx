import React, { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/iverbas/useAuth";
import logo from "@/assets/logo-iverbas.png";
import { Eye, EyeOff, Globe, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const LoginPage: React.FC = () => {
  const { t, locale, setLocale } = useLanguage();
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "recover") {
        const { error } = await resetPassword(email);
        if (error) setError(error);
        else setSuccess(locale === "pt" ? "E-mail de recuperação enviado!" : "Recovery email sent!");
      } else if (mode === "signup") {
        const { error } = await signUp(email, password, fullName);
        if (error) setError(error);
        else setSuccess(locale === "pt" ? "Conta criada! Verifique seu e-mail para confirmar." : "Account created! Check your email to confirm.");
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full gradient-brand opacity-10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full gradient-brand opacity-5 blur-3xl" />

      <button
        onClick={() => setLocale(locale === "pt" ? "en" : "pt")}
        className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors text-sm"
      >
        <Globe className="w-4 h-4" />
        {locale === "pt" ? "EN" : "PT"}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md mx-4"
      >
        <div className="bg-card rounded-2xl shadow-elevated p-8 border border-border">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="i-Verbas" className="h-12 object-contain" />
          </div>

          <h1 className="text-2xl font-display font-bold text-center text-foreground mb-1">
            {mode === "recover"
              ? t("recoverTitle")
              : mode === "signup"
              ? (locale === "pt" ? "Criar conta" : "Create account")
              : t("loginTitle")}
          </h1>
          <p className="text-muted-foreground text-center text-sm mb-6">
            {mode === "recover" ? t("recoverSubtitle") : t("loginSubtitle")}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-accent text-primary text-sm">{success}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  {locale === "pt" ? "Nome completo" : "Full name"}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                  required
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">{t("email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                placeholder="nome@empresa.com.br"
                required
              />
            </div>

            {mode !== "recover" && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t("password")}</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow pr-11"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg gradient-brand text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "recover"
                ? t("sendRecovery")
                : mode === "signup"
                ? (locale === "pt" ? "Criar conta" : "Create account")
                : t("login")}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            {mode === "login" && (
              <>
                <button onClick={() => { setMode("recover"); setError(null); setSuccess(null); }} className="text-sm text-primary hover:underline block w-full">
                  {t("forgotPassword")}
                </button>
                <button onClick={() => { setMode("signup"); setError(null); setSuccess(null); }} className="text-sm text-muted-foreground hover:text-foreground block w-full">
                  {locale === "pt" ? "Não tem conta? Criar conta" : "No account? Sign up"}
                </button>
              </>
            )}
            {mode !== "login" && (
              <button onClick={() => { setMode("login"); setError(null); setSuccess(null); }} className="text-sm text-primary hover:underline">
                {t("backToLogin")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
