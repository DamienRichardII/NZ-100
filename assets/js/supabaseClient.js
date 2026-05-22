/**
 * NZ 100% — Supabase Client v3
 * -------------------------------------------------------
 * Utilise UNIQUEMENT la clé anon/public.
 * Ne jamais exposer la service_role key côté frontend.
 * RLS activé sur toutes les tables sensibles.
 *
 * Convention colonnes :
 *   client_id        = profiles.id (UUID)
 *   sender_id        = profiles.id (UUID) — expéditeur
 *   receiver_id      = profiles.id (UUID) — destinataire (nullable)
 *   sender_type      = 'client' | 'admin'
 *   body             = texte du message
 *   is_read          = boolean (lu/non lu)
 *   is_done          = boolean (contenu complété)
 *   progress_percent = int 0-100 (progression partielle)
 *   first_name       = prénom (leads)
 *   last_name        = nom de famille (leads)
 * -------------------------------------------------------
 */

// ============================================================
// CONFIGURATION
// ============================================================

const NZ_SUPABASE_URL  = 'https://gzrlhvbqdscccqdcklpn.supabase.co';
const NZ_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6cmxodmJxZHNjY2NxZGNrbHBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjk1NDIsImV4cCI6MjA5NDg0NTU0Mn0.QObQSIUryEDtJHU-fCFeAVVWBF3-H5cV6GTR-2eLYM8';

// Initialisation du client Supabase (CDN supabase-js v2 requis)
// Guard : si le CDN n'est pas chargé (ex: file://, réseau coupé), on arrête proprement.
if (!window.supabase) {
  console.error('[NZ] ERREUR — window.supabase absent. Ouvrez le site via http://localhost:5500 (pas file://).');
  window.NZ = null;
  throw new Error('[NZ] CDN Supabase non chargé — supabaseClient.js interrompu.');
}

const _sb = window.supabase.createClient(NZ_SUPABASE_URL, NZ_SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
console.log('[NZ] Supabase initialisé — projet gzrlhvbqdscccqdcklpn');

// ============================================================
// AUTH — UTILISATEUR COURANT
// ============================================================

/** Retourne l'utilisateur Auth courant ou null. */
async function getCurrentUser() {
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

/** Retourne le profil complet (table profiles) ou null. */
async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await _sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) { console.error('[NZ] getCurrentProfile:', error.message); return null; }
  return data;
}

/** Redirige vers espace-membre.html si non connecté. */
async function requireAuth(redirectUrl = '/espace-membre.html') {
  const user = await getCurrentUser();
  if (!user) { window.location.href = redirectUrl; return null; }
  return user;
}

/** Redirige si non admin. */
async function requireAdmin(redirectUrl = '/index.html') {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    window.location.href = redirectUrl;
    return null;
  }
  return profile;
}

// ============================================================
// AUTH — INSCRIPTION / CONNEXION / DÉCONNEXION
// ============================================================

/**
 * Inscription d'un nouveau client.
 * Supabase envoie un email de confirmation automatiquement.
 * @param {string} email
 * @param {string} password
 * @param {string} fullName
 */
async function signUpClient(email, password, fullName) {
  const { data, error } = await _sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }   // récupéré par le trigger handle_new_user()
    }
  });
  if (error) console.error('[NZ] signUpClient:', error.message);
  return { user: data?.user || null, error };
}

/** Connexion. */
async function signInClient(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) console.error('[NZ] signInClient:', error.message);
  return { user: data?.user || null, error };
}

/** Déconnexion + redirection accueil. */
async function signOutClient() {
  const { error } = await _sb.auth.signOut();
  if (error) console.error('[NZ] signOutClient:', error.message);
  window.location.href = '/index.html';
}

// ============================================================
// LEADS — FORMULAIRE DE CONTACT
// ============================================================

/**
 * Insère un lead depuis le formulaire de contact.
 * Public insert — RLS autorise sans auth.
 * Colonnes : first_name, last_name, email, phone, program_interest, objective, message, source
 *
 * Accepte aussi l'ancien champ "name" pour compatibilité descendante :
 * si name est fourni et first_name absent, splitte automatiquement.
 *
 * @param {{ first_name, last_name, email, phone, message, program_interest, objective, source, name }} params
 */
async function insertLead({
  first_name = null, last_name = null,
  name = null,                           // compat descendante
  email,
  phone = null,
  message = null,
  program_interest = null,
  objective = null,
  source = 'contact_form'
}) {
  if (!_sb) throw new Error('[NZ] Client Supabase non initialisé');

  // Compatibilité : si first_name absent mais name présent, on splitte
  if (!first_name && name) {
    const parts = name.trim().split(' ');
    first_name = parts[0] || '';
    last_name  = parts.slice(1).join(' ') || null;
  }

  if (!first_name || !email) throw new Error('[NZ] Prénom et email requis.');

  const cleanPayload = {
    first_name:       first_name.trim(),
    last_name:        last_name  ? last_name.trim() : null,
    email:            email.trim().toLowerCase(),
    phone:            phone            ? phone.trim()    : null,
    program_interest: program_interest || null,
    objective:        objective        || null,
    message:          message          ? message.trim()  : null,
    status:           'nouveau',
    source:           source           || 'contact_form'
  };

  console.log('[NZ Supabase] insertLead payload →', cleanPayload);

  const { data, error } = await _sb
    .from('leads')
    .insert([cleanPayload])
    .select()
    .single();

  if (error) {
    console.error('[NZ Contact] Supabase insertLead error:', error.message, error);
    throw error;
  }

  console.log('[NZ Supabase] insertLead succès — lead enregistré :', data);
  return data;
}

// ============================================================
// MESSAGERIE CLIENT ↔ MATHIEU
// ============================================================

/**
 * Envoie un message.
 * Colonnes DB : client_id, sender_id (auth.uid()), sender_type, body
 * @param {string} clientId   — UUID du client (thread)
 * @param {string} body       — texte du message
 * @param {'client'|'admin'} senderType
 */
async function sendMessage(clientId, body, senderType = 'client') {
  if (!body || !body.trim()) return { success: false, error: 'Message vide.' };

  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Non connecté.' };

  const { error } = await _sb.from('messages').insert({
    client_id:   clientId,
    sender_id:   user.id,
    sender_type: senderType,
    body:        body.trim()
  });

  if (error) {
    console.error('[NZ] sendMessage:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, error: null };
}

/**
 * Récupère la conversation d'un client (ordre chronologique).
 * @param {string} clientId
 * @returns {Array<{id, sender_type, body, is_read, created_at}>}
 */
async function fetchMessages(clientId) {
  const { data, error } = await _sb
    .from('messages')
    .select('id, sender_type, body, is_read, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  if (error) { console.error('[NZ] fetchMessages:', error.message); return []; }
  return data || [];
}

/**
 * Marque les messages d'un thread comme lus.
 * @param {string} clientId
 */
async function markMessagesRead(clientId) {
  await _sb
    .from('messages')
    .update({ is_read: true })
    .eq('client_id', clientId)
    .eq('is_read', false);
}

/**
 * S'abonne aux nouveaux messages d'un client en temps réel (Supabase Realtime).
 * @param {string} clientId — UUID du client (thread)
 * @param {function} callback — appelée avec le nouveau message (payload.new)
 * @returns {RealtimeChannel} — appeler .unsubscribe() au démontage
 */
function subscribeToMessages(clientId, callback) {
  if (!clientId || typeof callback !== 'function') {
    console.warn('[NZ] subscribeToMessages : clientId ou callback manquant.');
    return null;
  }
  return _sb
    .channel('nz-messages-' + clientId)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: 'client_id=eq.' + clientId
    }, function(payload) { callback(payload.new); })
    .subscribe(function(status) {
      console.log('[NZ] Realtime messages status :', status);
    });
}

// ============================================================
// PROGRAMMES & PROGRESSION CLIENT
// ============================================================

/**
 * Récupère les programmes actifs d'un client.
 * Colonnes client_programs : client_id, status, started_at, progress_pct
 * @param {string} userId — profiles.id
 */
async function fetchClientPrograms(userId) {
  const { data, error } = await _sb
    .from('client_programs')
    .select(`
      id, status, started_at, progress_pct,
      programs ( id, slug, title, subtitle, duration_weeks )
    `)
    .eq('client_id', userId)
    .eq('status', 'active');

  if (error) { console.error('[NZ] fetchClientPrograms:', error.message); return []; }
  return data || [];
}

/**
 * Récupère les modules et contenus d'un programme.
 * @param {string} programId
 */
async function fetchProgramModules(programId) {
  const { data, error } = await _sb
    .from('program_modules')
    .select(`
      id, title, position,
      program_contents ( id, title, content_type, content_url, description, position, duration_min )
    `)
    .eq('program_id', programId)
    .order('position', { ascending: true });

  if (error) { console.error('[NZ] fetchProgramModules:', error.message); return []; }
  return data || [];
}

/**
 * Récupère la progression d'un client sur ses contenus.
 * Colonne : client_id (profiles.id)
 * @param {string} clientId — profiles.id
 * @returns {Array<{content_id, is_done, completed_at}>}
 */
async function fetchContentProgress(clientId) {
  const { data, error } = await _sb
    .from('content_progress')
    .select('content_id, is_done, completed_at')
    .eq('client_id', clientId);

  if (error) { console.error('[NZ] fetchContentProgress:', error.message); return []; }
  return data || [];
}

/**
 * Marque un contenu comme complété.
 * Upsert sur (client_id, content_id) — colonne is_done.
 * @param {string} clientId  — profiles.id
 * @param {string} contentId — program_contents.id
 */
async function markContentDone(clientId, contentId) {
  const { error } = await _sb.from('content_progress').upsert({
    client_id:    clientId,
    content_id:   contentId,
    is_done:      true,
    completed_at: new Date().toISOString()
  }, { onConflict: 'client_id,content_id' });

  if (error) { console.error('[NZ] markContentDone:', error.message); return { success: false }; }

  // Recalcul asynchrone de la progression
  _recalcProgress(clientId, contentId).catch(e => console.warn('[NZ] _recalcProgress:', e));
  return { success: true };
}

/**
 * Recalcule progress_pct dans client_programs pour ce client et ce programme.
 * @private
 */
async function _recalcProgress(clientId, contentId) {
  // 1. Trouver le programme à partir du contenu
  const { data: pc } = await _sb
    .from('program_contents')
    .select('module_id')
    .eq('id', contentId)
    .single();
  if (!pc) return;

  const { data: pm } = await _sb
    .from('program_modules')
    .select('program_id')
    .eq('id', pc.module_id)
    .single();
  if (!pm) return;

  const programId = pm.program_id;

  // 2. Tous les modules du programme
  const { data: allModules } = await _sb
    .from('program_modules')
    .select('id')
    .eq('program_id', programId);
  if (!allModules?.length) return;

  const moduleIds = allModules.map(m => m.id);

  // 3. Tous les contenus du programme
  const { data: allContents } = await _sb
    .from('program_contents')
    .select('id')
    .in('module_id', moduleIds);
  if (!allContents?.length) return;

  const contentIds = allContents.map(c => c.id);
  const total = contentIds.length;

  // 4. Contenus complétés par ce client dans ce programme
  const { count: done } = await _sb
    .from('content_progress')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_done', true)
    .in('content_id', contentIds);

  // 5. Mise à jour progress_pct
  const pct = total > 0 ? Math.round(((done || 0) / total) * 100) : 0;
  await _sb
    .from('client_programs')
    .update({ progress_pct: pct })
    .eq('client_id', clientId)
    .eq('program_id', programId);
}

// ============================================================
// RÉSERVATIONS — COACHING BASKET
// ============================================================

/**
 * Soumet une demande de réservation.
 * Public insert — RLS autorise sans auth.
 * Colonnes DB : name, email, phone, service, requested_date, requested_time, message
 *
 * Paramètres d'entrée (depuis coaching-basket.html) :
 *   session_type   → stocké dans service
 *   preferred_date → format "YYYY-MM-DD HHhMM" → splitté en requested_date + requested_time
 */
async function submitBookingRequest({
  name, email, phone = null,
  session_type,
  preferred_date = null,
  message = null
}) {
  if (!name || !email || !session_type) {
    return { success: false, error: 'Nom, email et type de séance requis.' };
  }

  // Découpage de preferred_date "2026-05-20 17h30" → date + time
  const parts = (preferred_date || '').split(' ');
  const requested_date = parts[0] || null;   // "2026-05-20"
  const requested_time = parts[1] || null;   // "17h30"

  const { error } = await _sb.from('booking_requests').insert({
    name:           name.trim(),
    email:          email.trim().toLowerCase(),
    phone:          phone ? phone.trim() : null,
    service:        session_type,
    requested_date: requested_date,
    requested_time: requested_time,
    message:        message ? message.trim() : null
  });

  if (error) {
    console.error('[NZ] submitBookingRequest:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, error: null };
}

// ============================================================
// ============================================================
// ADMIN — GESTION LEADS / RÉSERVATIONS / PROGRAMMES
// ============================================================

/** Met à jour le statut d'un lead.
 * @param {string} leadId
 * @param {string} status — 'nouveau' | 'contacte' | 'converti' | 'refuse'
 */
async function updateLeadStatus(leadId, status) {
  const { error } = await _sb.from('leads').update({ status }).eq('id', leadId);
  if (error) { console.error('[NZ] updateLeadStatus:', error.message); return { success: false }; }
  return { success: true };
}

/** Met à jour le statut d'une réservation.
 * @param {string} bookingId
 * @param {string} status — 'pending' | 'confirmed' | 'cancelled'
 */
async function updateBookingStatus(bookingId, status) {
  const { error } = await _sb.from('booking_requests').update({ status }).eq('id', bookingId);
  if (error) { console.error('[NZ] updateBookingStatus:', error.message); return { success: false }; }
  return { success: true };
}

/** Assigne un programme à un client.
 * @param {string} clientId  — profiles.id
 * @param {string} programId — programs.id
 */
async function assignProgramToClient(clientId, programId) {
  const { error } = await _sb.from('client_programs').insert({
    client_id:  clientId,
    program_id: programId,
    status:     'active'
  });
  if (error) {
    console.error('[NZ] assignProgramToClient:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, error: null };
}

// ADMIN — TABLEAU DE BORD MATHIEU
// ============================================================

/**
 * KPIs + leads récents + réservations en attente.
 * Requiert role='admin' (vérifié côté serveur par RLS + is_admin()).
 * Colonnes leads : first_name, last_name, email, program_interest, status
 * Colonnes booking_requests : name, email, service, requested_date, requested_time, status
 */
async function fetchAdminDashboard() {
  const [leadsCount, clientsCount, bookingsPending, recentLeads, recentBookings] = await Promise.all([
    _sb.from('leads').select('id', { count: 'exact', head: true }),
    _sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
    _sb.from('booking_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    _sb.from('leads')
       .select('id, first_name, last_name, email, program_interest, status, created_at')
       .order('created_at', { ascending: false })
       .limit(10),
    _sb.from('booking_requests')
       .select('id, name, email, service, requested_date, requested_time, status, created_at')
       .eq('status', 'pending')
       .order('created_at', { ascending: false })
       .limit(10)
  ]);

  return {
    leads_count:      leadsCount.count      || 0,
    clients_count:    clientsCount.count    || 0,
    bookings_pending: bookingsPending.count || 0,
    recent_leads:     recentLeads.data      || [],
    recent_bookings:  recentBookings.data   || []
  };
}

/**
 * Récupère tous les leads (liste complète pour admin).
 * @param {{ status?: string, limit?: number }} options
 */
async function fetchAdminLeads({ status = null, limit = 50 } = {}) {
  let query = _sb
    .from('leads')
    .select('id, first_name, last_name, email, phone, program_interest, objective, message, status, source, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { console.error('[NZ] fetchAdminLeads:', error.message); return []; }
  return data || [];
}

/**
 * Récupère toutes les séances (pour le calendrier admin).
 * @param {{ clientId?: string, status?: string, from?: string, to?: string }} options
 */
async function fetchAdminSessions({ clientId = null, status = null, from = null, to = null } = {}) {
  let query = _sb
    .from('sessions')
    .select(`
      id, session_date, start_time, end_time, service, location, status, price_eur, notes, created_at,
      profiles ( id, full_name, email, phone )
    `)
    .order('session_date', { ascending: true });

  if (clientId) query = query.eq('client_id', clientId);
  if (status)   query = query.eq('status', status);
  if (from)     query = query.gte('session_date', from);
  if (to)       query = query.lte('session_date', to);

  const { data, error } = await query;
  if (error) { console.error('[NZ] fetchAdminSessions:', error.message); return []; }
  return data || [];
}

/**
 * Récupère tous les threads messages (un par client) pour l'admin.
 * Retourne le dernier message de chaque thread + infos client.
 */
async function fetchAdminMessages() {
  const { data, error } = await _sb
    .from('messages')
    .select(`
      id, client_id, sender_type, body, is_read, created_at,
      profiles!messages_client_id_fkey ( id, full_name, email )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) { console.error('[NZ] fetchAdminMessages:', error.message); return []; }

  // Déduplique : garde le dernier message par client_id
  const threads = {};
  (data || []).forEach(function(msg) {
    if (!threads[msg.client_id]) threads[msg.client_id] = msg;
  });
  return Object.values(threads);
}

/**
 * Récupère les contenus d'un module.
 * @param {string} moduleId
 */
async function fetchProgramContents(moduleId) {
  const { data, error } = await _sb
    .from('program_contents')
    .select('id, title, content_type, content_url, description, position, duration_min, is_active')
    .eq('module_id', moduleId)
    .order('position', { ascending: true });

  if (error) { console.error('[NZ] fetchProgramContents:', error.message); return []; }
  return data || [];
}

// ============================================================
// EXPORT GLOBAL
// ============================================================

window.NZ = {
  // Auth
  getCurrentUser,
  getCurrentProfile,
  requireAuth,
  requireAdmin,
  signUpClient,
  signInClient,
  signOutClient,
  // Contact
  insertLead,
  // Messagerie
  sendMessage,
  fetchMessages,
  markMessagesRead,
  subscribeToMessages,
  // Programmes
  fetchClientPrograms,
  fetchProgramModules,
  fetchProgramContents,
  fetchContentProgress,
  markContentDone,
  // Réservations
  submitBookingRequest,
  // Admin — Dashboard
  fetchAdminDashboard,
  // Admin — Leads
  fetchAdminLeads,
  updateLeadStatus,
  // Admin — Sessions
  fetchAdminSessions,
  // Admin — Messages
  fetchAdminMessages,
  // Admin — Bookings
  updateBookingStatus,
  // Admin — Programmes
  assignProgramToClient,
  // Client Supabase brut (requêtes custom)
  _sb
};

console.log('[NZ 100%] supabaseClient.js v3 chargé — prêt.');
