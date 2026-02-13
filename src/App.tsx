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
import { ChatWindow } from './components/ChatWindow';
import { DownloadApp } from './components/DownloadApp';
import { usePersonas } from './hooks/usePersonas';
import { useDeletePersona } from './hooks/useDeletePersona';
import type { Persona } from './types';

type Tab = 'create' | 'personas' | 'chat' | 'desktop';

function App() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [createdPersona, setCreatedPersona] = useState<Persona | null>(null);

  // Chat state
  const [chatPersona, setChatPersona] = useState<Persona | null>(null);

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
    const { error } = await supabase.auth.signOut({ scope: 'local' });
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

  // Handle chat from PersonaCard - navigate to chat tab with persona pre-selected
  const handleChatPersona = (persona: Persona) => {
    setChatPersona(persona);
    setActiveTab('chat');
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
        <header className="relative overflow-hidden header-premium">
          {/* Multi-layer Background */}
          <div className="absolute inset-0 header-bg-gradient"></div>

          {/* Geometric Art Deco Pattern */}
          <div className="absolute inset-0 header-pattern opacity-[0.03]"></div>

          {/* Ambient Glow Orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 w-80 h-80 bg-cosmic-cyan/8 rounded-full blur-[100px] animate-float"></div>
            <div className="absolute -top-10 right-1/4 w-60 h-60 bg-cosmic-purple/10 rounded-full blur-[80px] animate-float" style={{animationDelay: '3s'}}></div>
            <div className="absolute top-0 right-0 w-40 h-40 bg-cosmic-magenta/6 rounded-full blur-[60px] animate-float" style={{animationDelay: '1.5s'}}></div>
          </div>

          {/* Top Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cosmic-cyan/40 to-transparent"></div>

          <div className="max-w-7xl mx-auto px-8 py-6 relative z-10">
            <div className="flex items-center justify-between">

              {/* Logo & Brand Section */}
              <div className="flex items-center gap-6 animate-fade-in">
                {/* Enhanced Logo Container - 20% larger */}
                <div className="relative group cursor-pointer">
                  {/* Outer Glow Ring */}
                  <div className="absolute -inset-3 bg-gradient-to-br from-cosmic-cyan/20 via-cosmic-purple/10 to-cosmic-magenta/20 rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                  {/* Logo Frame with Art Deco corners */}
                  <div className="relative">
                    {/* Corner Accents */}
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cosmic-cyan/50 rounded-tl-lg"></div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cosmic-cyan/50 rounded-tr-lg"></div>
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cosmic-magenta/50 rounded-bl-lg"></div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cosmic-magenta/50 rounded-br-lg"></div>

                    {/* Main Logo Container - increased from 64px to 77px (20% larger) */}
                    <div className="relative w-[77px] h-[77px] bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl p-2.5 border border-white/10 group-hover:border-cosmic-cyan/40 transition-all duration-300 group-hover:scale-105">
                      <img
                        src="https://www.themagicworlds.com/_next/image?url=%2Fimages%2Flogo%2Flogo.png&w=640&q=75"
                        alt="Magic Worlds Logo"
                        className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(0,240,255,0.3)]"
                      />

                      {/* Shine Effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>

                  </div>
                </div>

                {/* Brand Text with enhanced typography */}
                <div className="flex flex-col">
                  {/* Main Title */}
                  <div className="relative">
                    <h1 className="text-[2rem] font-display font-black leading-none tracking-tight">
                      <span className="header-title-gradient">Magic Persona</span>
                      <span className="text-white ml-2">Builder</span>
                    </h1>
                    {/* Subtle underline accent */}
                    <div className="absolute -bottom-1 left-0 w-24 h-[2px] bg-gradient-to-r from-cosmic-cyan to-transparent rounded-full"></div>
                  </div>

                  {/* Tagline with refined styling */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cosmic-cyan animate-pulse"></span>
                      <span className="w-1 h-1 rounded-full bg-cosmic-purple animate-pulse" style={{animationDelay: '0.5s'}}></span>
                      <span className="w-0.5 h-0.5 rounded-full bg-cosmic-magenta animate-pulse" style={{animationDelay: '1s'}}></span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-body uppercase tracking-[0.2em]">
                      Powered by <span className="text-cosmic-cyan font-medium">Flowise AI</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* User Actions Section - Enhanced */}
              <div className="flex items-center gap-5 animate-fade-in" style={{animationDelay: '0.15s'}}>

                {/* User Profile Card */}
                <div className="hidden md:flex items-center gap-4 header-user-card px-5 py-3 rounded-2xl">
                  {/* Avatar */}
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cosmic-purple via-cosmic-magenta to-cosmic-cyan p-[2px]">
                      <div className="w-full h-full rounded-[10px] bg-cosmic-dark flex items-center justify-center">
                        <svg className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    </div>
                    {/* Online Indicator */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-cosmic-dark"></div>
                  </div>

                  {/* User Info */}
                  <div className="text-left">
                    <p className="text-sm font-display font-semibold text-white leading-none">
                      {session?.user?.email?.split('@')[0] || 'User'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-cosmic-cyan font-medium uppercase tracking-wider">
                        {personas.length} {personas.length === 1 ? 'Persona' : 'Personas'}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Active</span>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="hidden md:block w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>

                {/* Sign Out Button - Refined */}
                <button
                  onClick={handleSignOut}
                  className="group relative px-6 py-3 header-signout-btn rounded-xl overflow-hidden"
                >
                  {/* Animated Border */}
                  <div className="absolute inset-0 rounded-xl border border-white/10 group-hover:border-cosmic-cyan/30 transition-colors duration-300"></div>

                  {/* Hover Gradient Sweep */}
                  <div className="absolute inset-0 bg-gradient-to-r from-cosmic-cyan/0 via-cosmic-cyan/5 to-cosmic-cyan/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>

                  {/* Button Content */}
                  <div className="relative flex items-center gap-2.5">
                    <span className="text-sm font-display font-semibold text-white/90 group-hover:text-white transition-colors">Sign Out</span>
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-cosmic-cyan group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Border with Gradient */}
          <div className="absolute bottom-0 left-0 right-0">
            <div className="h-px bg-gradient-to-r from-transparent via-cosmic-cyan/30 to-transparent"></div>
            <div className="h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
          </div>
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
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-8 py-4 font-display font-semibold border-b-2 transition-all relative group ${
                activeTab === 'chat'
                  ? 'border-cosmic-cyan text-cosmic-cyan'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat
              </span>
              {activeTab === 'chat' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cosmic-cyan to-cosmic-purple glow-cyan"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('desktop')}
              className={`px-8 py-4 font-display font-semibold border-b-2 transition-all relative group ${
                activeTab === 'desktop'
                  ? 'border-cosmic-cyan text-cosmic-cyan'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Desktop App
              </span>
              {activeTab === 'desktop' && (
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
                    onChat={handleChatPersona}
                  />
                </section>
              )}
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="animate-slide-up">
              <ChatWindow
                personas={personas}
                selectedPersona={chatPersona}
                onSelectPersona={(persona) => setChatPersona(persona)}
                isLoadingPersonas={isPersonasLoading}
                onNavigateToCreate={() => setActiveTab('create')}
              />
            </div>
          )}

          {/* Desktop App Tab */}
          {activeTab === 'desktop' && <DownloadApp />}
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
