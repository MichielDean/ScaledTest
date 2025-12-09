import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { createK8sPlatformApi } from "../lib/k8s-platform-api";
import { createApiClient } from "../lib";
import type { Project } from "../types/k8s-platform";

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(() => session?.accessToken ?? null, [session]);
  const apiClient = createApiClient(getToken);
  const k8sApi = createK8sPlatformApi(apiClient);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);

    const response = await k8sApi.listProjects();

    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setProjects(response.data.projects || []);
    }

    setLoading(false);
  };

  const handleDelete = async (projectId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this project? This action cannot be undone.",
      )
    ) {
      return;
    }

    const response = await k8sApi.deleteProject(projectId);
    if (response.error) {
      setError(response.error);
    } else {
      loadProjects();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <button
          id="create-project-button"
          onClick={() => navigate("/projects/new")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Project
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">
            No projects yet. Create your first project to get started.
          </p>
          <button
            id="create-first-project-button"
            onClick={() => navigate("/projects/new")}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {project.name}
              </h3>
              {project.description && (
                <p className="text-gray-600 mb-4">{project.description}</p>
              )}
              {project.gitRepositoryUrl && (
                <p
                  className="text-sm text-blue-600 mb-4 truncate"
                  title={project.gitRepositoryUrl}
                >
                  {project.gitRepositoryUrl}
                </p>
              )}
              <div className="text-sm text-gray-500 mb-4">
                Created: {new Date(project.createdAt).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <button
                  id={`manage-project-${project.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/projects/${project.id}`);
                  }}
                  className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  Manage
                </button>
                <button
                  id={`delete-project-${project.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id);
                  }}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
