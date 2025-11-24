import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PersonaForm } from './components/PersonaForm';
import { PersonaList } from './components/PersonaList';
import { SettingsPanel } from './components/SettingsPanel';
import { ApiEndpointDisplay } from './components/ApiEndpointDisplay';
import { DeleteConfirmation } from './components/DeleteConfirmation';
import { usePersonas } from './hooks/usePersonas';
import { useDeletePersona } from './hooks/useDeletePersona';
import type { Persona } from './types';

type Tab = 'create' | 'personas';

function App() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [createdPersona, setCreatedPersona] = useState<Persona | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null);

  // Hooks
  const { personas, isLoading: isPersonasLoading, refetch } = usePersonas();
  const { deletePersona } = useDeletePersona();

  // Check authentication state on mount
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle sign out
  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to sign out');
    } else {
      toast.success('Signed out successfully');
      // Reset state
      setSelectedPersona(null);
      setCreatedPersona(null);
      setActiveTab('create');
    }
  };

  // Handle persona creation success
  const handleCreateSuccess = (persona: Persona) => {
    setCreatedPersona(persona);
    refetch(); // Refresh the personas list
  };

  // Handle persona selection from list
  const handleSelectPersona = (persona: Persona) => {
    setSelectedPersona(persona);
  };

  // Handle persona update from settings
  const handleUpdatePersona = (updatedPersona: Persona) => {
    setSelectedPersona(updatedPersona);
    refetch(); // Refresh the list to show updated data
  };

  // Handle delete request (show confirmation)
  const handleDeleteRequest = (personaId: string) => {
    const persona = personas.find((p) => p.id === personaId);
    if (persona) {
      setDeleteTarget(persona);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    const success = await deletePersona(deleteTarget.id);
    if (success) {
      toast.success(`"${deleteTarget.name}" deleted successfully`);
      // Clear selection if we deleted the selected persona
      if (selectedPersona?.id === deleteTarget.id) {
        setSelectedPersona(null);
      }
      // Clear created persona if we deleted it
      if (createdPersona?.id === deleteTarget.id) {
        setCreatedPersona(null);
      }
      refetch();
    } else {
      toast.error('Failed to delete persona');
    }
    setDeleteTarget(null);
  };

  // Handle back from persona detail view
  const handleBackToList = () => {
    setSelectedPersona(null);
  };

  // Show loading state while checking auth
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center cosmic-bg">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cosmic-cyan border-t-transparent glow-cyan"></div>
          <p className="mt-6 text-gray-300 font-body">Loading Magic...</p>
        </div>
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!session) {
    return (
      <ErrorBoundary>
        <Toaster position="top-right" />
        <Auth />
      </ErrorBoundary>
    );
  }

  // Main app content when logged in
  return (
    <ErrorBoundary>
      <div className="min-h-screen cosmic-bg">
        <Toaster position="top-right" />

        {/* Header */}
        <header className="relative glass-strong border-b border-cosmic-cyan/20 overflow-hidden">
          {/* Animated Background Layer */}
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-cosmic-cyan/20 rounded-full blur-3xl animate-float"></div>
            <div className="absolute top-0 right-1/4 w-48 h-48 bg-cosmic-purple/20 rounded-full blur-3xl animate-float" style={{animationDelay: '2s'}}></div>
          </div>

          <div className="max-w-7xl mx-auto px-6 py-5 relative z-10">
            <div className="flex items-center justify-between">
              {/* Logo & Brand Section */}
              <div className="flex items-center gap-5 animate-fade-in">
                {/* Magic Worlds Logo */}
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-cosmic-cyan to-cosmic-purple rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity"></div>
                  <div className="relative w-16 h-16 bg-white/5 backdrop-blur-sm rounded-2xl p-2 border border-white/10 group-hover:border-cosmic-cyan/30 transition-all">
                    <img
                      src="https://www.themagicworlds.com/_next/image?url=%2Fimages%2Flogo%2Flogo.png&w=640&q=75"
                      alt="Magic Worlds Logo"
                      className="w-full h-full object-contain"
                    />
                    {/* Animated Particles */}
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-cosmic-cyan rounded-full animate-ping"></div>
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-cosmic-magenta rounded-full animate-ping" style={{animationDelay: '1s'}}></div>
                  </div>
                </div>

                {/* Brand Text */}
                <div>
                  <h1 className="text-3xl font-display font-black gradient-text leading-none mb-1 tracking-tight">
                    Magic Persona Builder
                  </h1>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-cosmic-cyan animate-pulse"></div>
                    <p className="text-xs text-gray-400 font-body uppercase tracking-wider">
                      Powered by <span className="text-cosmic-cyan font-semibold">Flowise AI</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* User Actions Section */}
              <div className="flex items-center gap-4 animate-fade-in" style={{animationDelay: '0.1s'}}>
                {/* User Info Badge */}
                <div className="hidden md:flex items-center gap-3 glass px-4 py-2.5 rounded-xl border border-white/10">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cosmic-purple to-cosmic-magenta flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-display font-semibold text-white leading-none mb-0.5">
                      {session?.user?.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 font-body">
                      {personas.length} {personas.length === 1 ? 'Persona' : 'Personas'}
                    </p>
                  </div>
                </div>

                {/* Sign Out Button */}
                <button
                  onClick={handleSignOut}
                  className="group relative px-5 py-2.5 glass hover:glass-strong rounded-xl border border-white/20 hover:border-cosmic-cyan/50 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cosmic-cyan/0 via-cosmic-cyan/10 to-cosmic-cyan/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <div className="relative flex items-center gap-2">
                    <span className="text-sm font-display font-semibold text-white">Sign Out</span>
                    <svg className="w-4 h-4 text-cosmic-cyan group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Glow Line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cosmic-cyan to-transparent opacity-50"></div>
        </header>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-6 pt-8">
          <div className="flex gap-4 border-b border-white/10">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-8 py-4 font-display font-semibold border-b-2 transition-all relative group ${
                activeTab === 'create'
                  ? 'border-cosmic-cyan text-cosmic-cyan'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span className="relative z-10">Create</span>
              {activeTab === 'create' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cosmic-cyan to-cosmic-purple glow-cyan"></div>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('personas');
                setSelectedPersona(null);
              }}
              className={`px-8 py-4 font-display font-semibold border-b-2 transition-all relative group ${
                activeTab === 'personas'
                  ? 'border-cosmic-cyan text-cosmic-cyan'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                My Personas
                {personas.length > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-cosmic-purple/30 text-cosmic-cyan rounded-full border border-cosmic-cyan/30">
                    {personas.length}
                  </span>
                )}
              </span>
              {activeTab === 'personas' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cosmic-cyan to-cosmic-purple glow-cyan"></div>
              )}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-10">
          {/* Create Tab */}
          {activeTab === 'create' && (
            <div className="space-y-8">
              {/* Create Persona Form */}
              <section className="glass-strong rounded-2xl p-8 card-cosmic animate-slide-up">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cosmic-cyan to-cosmic-purple flex items-center justify-center glow-cyan">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-display font-bold text-white mb-2">Create New Persona</h2>
                    <p className="text-gray-400 font-body">
                      Enter a famous person's name to generate an AI persona that can roleplay as them.
                    </p>
                  </div>
                </div>
                <PersonaForm onSuccess={handleCreateSuccess} />
              </section>

              {/* Created Persona Display */}
              {createdPersona && (
                <section className="glass-strong rounded-2xl p-8 card-cosmic animate-fade-in border-2 border-cosmic-cyan/40 glow-cyan">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-display font-bold text-white flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-cosmic-cyan animate-pulse glow-cyan"></span>
                      Persona Created: {createdPersona.name}
                    </h2>
                    <span className="px-4 py-1.5 text-xs font-bold font-display bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-full uppercase tracking-wide">
                      {createdPersona.status}
                    </span>
                  </div>

                  {/* API Endpoint Display */}
                  <ApiEndpointDisplay persona={createdPersona} />

                  {/* Settings Panel */}
                  <SettingsPanel
                    persona={createdPersona}
                    onUpdate={(updatedPersona) => {
                      setCreatedPersona(updatedPersona);
                    }}
                  />

                  {/* Create Another Button */}
                  <div className="mt-8 pt-8 border-t border-white/10 flex gap-4">
                    <button
                      onClick={() => setCreatedPersona(null)}
                      className="px-6 py-3 btn-cosmic rounded-xl font-display font-semibold transition-all hover:scale-105"
                    >
                      Create Another Persona
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('personas');
                        setSelectedPersona(createdPersona);
                        setCreatedPersona(null);
                      }}
                      className="px-6 py-3 glass hover:glass-strong rounded-xl font-display font-semibold text-white transition-all hover:scale-105 border border-white/20"
                    >
                      View in My Personas
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* My Personas Tab */}
          {activeTab === 'personas' && (
            <div className="space-y-8">
              {/* Persona Detail View */}
              {selectedPersona ? (
                <div className="space-y-8">
                  {/* Back Button */}
                  <button
                    onClick={handleBackToList}
                    className="flex items-center gap-2 text-gray-400 hover:text-cosmic-cyan font-body font-medium transition-all group"
                  >
                    <svg
                      className="w-5 h-5 transition-transform group-hover:-translate-x-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Back to list
                  </button>

                  {/* Persona Header */}
                  <section className="glass-strong rounded-2xl p-8 card-cosmic animate-slide-up">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-3xl font-display font-bold text-white mb-2">
                          {selectedPersona.name}
                        </h2>
                        <p className="text-sm text-gray-400 font-body">
                          Created {new Date(selectedPersona.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`px-4 py-1.5 text-xs font-bold font-display rounded-full uppercase tracking-wide ${
                          selectedPersona.status === 'active'
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white'
                            : selectedPersona.status === 'creating'
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
                            : 'bg-gradient-to-r from-red-400 to-pink-500 text-white'
                        }`}
                      >
                        {selectedPersona.status}
                      </span>
                    </div>

                    {/* API Endpoint */}
                    <ApiEndpointDisplay persona={selectedPersona} />
                  </section>

                  {/* Settings Panel */}
                  <section>
                    <SettingsPanel
                      persona={selectedPersona}
                      onUpdate={handleUpdatePersona}
                    />
                  </section>
                </div>
              ) : (
                /* Persona List View */
                <section className="glass-strong rounded-2xl p-8 card-cosmic animate-slide-up">
                  <h2 className="text-2xl font-display font-bold text-white mb-8">My Personas</h2>
                  <PersonaList
                    personas={personas}
                    isLoading={isPersonasLoading}
                    onSelect={handleSelectPersona}
                    onDelete={handleDeleteRequest}
                  />
                </section>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="max-w-6xl mx-auto px-6 py-8 text-center text-gray-500 text-sm font-body border-t border-white/5">
          <p className="text-gray-400">
            Powered by <span className="text-cosmic-cyan">Flowise</span>, <span className="text-cosmic-magenta">Supabase</span>, and <span className="text-cosmic-purple">Google Gemini</span>
          </p>
        </footer>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmation
          isOpen={!!deleteTarget}
          personaName={deleteTarget?.name || ''}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;
