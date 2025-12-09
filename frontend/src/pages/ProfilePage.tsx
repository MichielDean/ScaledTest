import React from "react";
import { useAuth } from "../contexts/AuthContext";

const ProfilePage: React.FC = () => {
  const { user, userProfile } = useAuth();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold">Profile Page</h1>

      <div
        id="user-profile-section"
        className="mt-8 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-xl font-semibold mb-4">User Information</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <p className="text-foreground">{userProfile?.name || "N/A"}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Email
            </label>
            <p className="text-foreground">{user?.email || "N/A"}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              User ID
            </label>
            <p className="text-foreground font-mono text-sm">
              {user?.id || "N/A"}
            </p>
          </div>
        </div>
      </div>

      <div
        id="user-roles-list"
        className="mt-6 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-xl font-semibold mb-4">Roles & Permissions</h2>

        <div className="flex items-center gap-2">
          <span
            id={`role-${(userProfile?.role || "user").toLowerCase()}`}
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
              userProfile?.role === "admin"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-foreground"
            }`}
          >
            {userProfile?.role || "user"}
          </span>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {userProfile?.role === "admin"
            ? "You have full administrative access to manage users and system settings."
            : "You have standard user access to view and manage your own data."}
        </p>
      </div>
    </div>
  );
};

export default ProfilePage;
