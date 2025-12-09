import React from "react";
import { Link } from "react-router-dom";

const UnauthorizedPage: React.FC = () => {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <div id="unauthorized-container" className="max-w-md text-center">
        <h1
          id="unauthorized-title"
          className="text-4xl font-bold text-foreground"
        >
          Access Denied
        </h1>
        <p
          id="unauthorized-message"
          className="mt-4 text-lg text-muted-foreground"
        >
          You do not have permission to access this page.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Return to Dashboard
        </Link>
      </div>
    </main>
  );
};

export default UnauthorizedPage;
