/**
 * Team Selector Component
 *
 * Provides a dropdown interface for users to select which teams they want to view data for.
 * Supports multi-team selection and displays current team context prominently.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTeams } from '../contexts/TeamContext';
import styles from '../styles/TeamSelector.module.css';

interface TeamSelectorProps {
  compact?: boolean; // Use compact mode for header display
  className?: string;
}

const TeamSelector: React.FC<TeamSelectorProps> = ({ compact = false, className = '' }) => {
  const {
    userTeams,
    selectedTeamIds,
    selectedTeams,
    hasMultipleTeams,
    loading,
    error,
    setSelectedTeamIds,
    selectAllTeams,
    clearTeamSelection,
  } = useTeams();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle team selection toggle
  const handleTeamToggle = (teamId: string) => {
    const isSelected = selectedTeamIds.includes(teamId);

    if (isSelected) {
      // Remove team from selection
      setSelectedTeamIds(selectedTeamIds.filter(id => id !== teamId));
    } else {
      // Add team to selection
      setSelectedTeamIds([...selectedTeamIds, teamId]);
    }
  };

  // Don't render if user has no teams
  if (loading || userTeams.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className={`${styles.error} ${className}`}>
        <span>⚠️ Team data unavailable</span>
      </div>
    );
  }

  // Single team display (no selector needed)
  if (!hasMultipleTeams) {
    const team = userTeams[0];
    return (
      <div className={`${styles.singleTeam} ${compact ? styles.compact : ''} ${className}`}>
        <span className={styles.teamIcon}>👥</span>
        <span className={styles.teamName}>{team?.name || 'Team'}</span>
      </div>
    );
  }

  // Multi-team selector
  const displayText = (() => {
    if (selectedTeams.length === 0) {
      return 'No teams selected';
    }
    if (selectedTeams.length === 1) {
      return selectedTeams[0]?.name || 'Team';
    }
    if (selectedTeams.length === userTeams.length) {
      return 'All teams';
    }
    return `${selectedTeams.length} teams`;
  })();

  return (
    <div
      className={`${styles.teamSelector} ${compact ? styles.compact : ''} ${className}`}
      ref={dropdownRef}
    >
      <button
        id="team-selector-button"
        className={`${styles.selectorButton} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select teams to view"
      >
        <span className={styles.teamIcon}>👥</span>
        <span className={styles.displayText}>{displayText}</span>
        <span className={styles.chevron} aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="listbox" aria-labelledby="team-selector-button">
          <div className={styles.dropdownHeader}>
            <h3 className={styles.dropdownTitle}>Select Teams</h3>
            <div className={styles.dropdownActions}>
              <button
                onClick={() => {
                  selectAllTeams();
                  setIsOpen(false);
                }}
                className={styles.actionButton}
                type="button"
                aria-label="Select all teams"
              >
                All
              </button>
              <button
                onClick={() => {
                  clearTeamSelection();
                  setIsOpen(false);
                }}
                className={styles.actionButton}
                type="button"
                aria-label="Clear team selection"
              >
                None
              </button>
            </div>
          </div>

          <div className={styles.teamList}>
            {userTeams.map(team => (
              <label
                key={team.id}
                className={styles.teamOption}
                role="option"
                aria-selected={selectedTeamIds.includes(team.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedTeamIds.includes(team.id)}
                  onChange={() => handleTeamToggle(team.id)}
                  className={styles.checkbox}
                  aria-describedby={`team-description-${team.id}`}
                />
                <div className={styles.teamInfo}>
                  <span className={styles.teamName}>{team.name}</span>
                  {team.description && (
                    <span id={`team-description-${team.id}`} className={styles.teamDescription}>
                      {team.description}
                    </span>
                  )}
                  {team.isDefault && (
                    <span className={styles.defaultBadge} aria-label="Default team">
                      Default
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className={styles.dropdownFooter}>
            <p className={styles.selectedCount}>
              {selectedTeams.length} of {userTeams.length} teams selected
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamSelector;
