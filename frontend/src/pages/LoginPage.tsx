import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LoginForm } from "../components/login-form";

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginForm
        email={email}
        password={password}
        error={error}
        loading={loading}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
      />
    </main>
  );
};

export default LoginPage;
