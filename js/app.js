
    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
    import { 
        initializeFirestore,
        persistentLocalCache,
        persistentMultipleTabManager,
        collection,
        doc,
        getDoc,
        getDocs,
        getDocsFromServer,
        setDoc,
        deleteDoc,
        onSnapshot,
        query,
        where
    } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
    import { 
        getAuth, 
        createUserWithEmailAndPassword, 
        signInWithEmailAndPassword, 
        signOut, 
        signInAnonymously,
        onAuthStateChanged,
        sendPasswordResetEmail,
        updatePassword,
        updateProfile,
        GoogleAuthProvider,
        signInWithPopup
    } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
    const firebaseConfig = {
        apiKey: "AIzaSyDbEYx361Xg3KfHoghlHAYTC-b8g6Yy2I8",
        authDomain: "thesnackstation-c6ff9.firebaseapp.com",
        projectId: "thesnackstation-c6ff9",
        storageBucket: "thesnackstation-c6ff9.firebasestorage.app",
        messagingSenderId: "830977242508",
        appId: "1:830977242508:web:cac072840fc4c9366c12a9",
        measurementId: "G-V404QLEB66"
    };

    const app = initializeApp(firebaseConfig);
    const db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
    const auth = getAuth(app);
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });

    const GA_MEASUREMENT_ID = firebaseConfig.measurementId;
    const GA_ENABLED = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX';
    let analyticsSearchTimer = null;

    function initializeGoogleAnalytics() {
        if (!GA_ENABLED) {
            console.info('Google Analytics is ready but inactive. Add your GA4 Measurement ID to firebaseConfig.measurementId.');
            return;
        }
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', GA_MEASUREMENT_ID, {
            send_page_view: true,
            anonymize_ip: true
        });
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
        document.head.appendChild(script);
    }

    function trackAnalyticsEvent(eventName, parameters = {}) {
        if (!GA_ENABLED || typeof window.gtag !== 'function') return;
        // Analytics parameters must never contain customer contact details,
        // delivery addresses, free-text instructions, or Firestore document IDs.
        window.gtag('event', eventName, parameters);
    }

    function analyticsItem(item, quantity = 1) {
        return {
            item_id: String(item.itemId || item.id || ''),
            item_name: String(item.name || 'Menu item').slice(0, 100),
            item_category: String(item.category || 'Menu').slice(0, 100),
            price: Number(item.price || 0),
            quantity: Number(quantity || item.quantity || item.qty || 1)
        };
    }

    initializeGoogleAnalytics();

    const MENU_CACHE_KEY = 'snackStationMenuCacheV1';
    const AUTH_UI_CACHE_KEY = 'snackStationAuthUiCacheV1';
    const DEFAULT_CATEGORIES = ['Promotion', "Let's Mex It Up", 'Everyday Value', 'Ala-Carte-&-Combos', 'Signature-Boxes', 'Sharing', 'Snacks-&-Beverages', 'Condiments', 'Midnight (Start at 12 am)'];

    function readCachedMenu() {
        try {
            const cached = JSON.parse(localStorage.getItem(MENU_CACHE_KEY));
            return Array.isArray(cached) ? cached : [];
        } catch (error) {
            localStorage.removeItem(MENU_CACHE_KEY);
            return [];
        }
    }

    function writeCachedMenu(items) {
        try {
            localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(items));
        } catch (error) {
            console.warn("Could not cache menu items:", error);
        }
    }

    function readCachedAuthUser() {
        try {
            const cached = JSON.parse(localStorage.getItem(AUTH_UI_CACHE_KEY));
            return cached && cached.name && cached.email ? cached : null;
        } catch (error) {
            localStorage.removeItem(AUTH_UI_CACHE_KEY);
            return null;
        }
    }

    function writeCachedAuthUser(user) {
        try {
            if (user) {
                localStorage.setItem(AUTH_UI_CACHE_KEY, JSON.stringify({
                    name: user.name,
                    email: user.email,
                    role: user.role
                }));
            } else {
                localStorage.removeItem(AUTH_UI_CACHE_KEY);
            }
        } catch (error) {
            console.warn("Could not cache the user widget:", error);
        }
    }

    let menuData = readCachedMenu();
    let isMenuLoading = menuData.length === 0;
    let cachedAuthUser = readCachedAuthUser();
    let isAuthLoading = true;
    let hadAuthenticatedSession = Boolean(cachedAuthUser);
    let isMenuBootstrapComplete = false;
    let hasCommittedInitialRender = false;
    let stopOrderTrackingListener = null;
    let stopKitchenOrdersListener = null;
    let stopCustomerOrdersListener = null;
    let kitchenListenerInitialized = false;
    let draggedCategoryName = null;
    let toastTimer = null;
    let previousCartCount = 0;
    let newestKitchenOrderId = null;
    
    let state = {
        currentUser: null, 
        users: [],
        orders: [],
        cart: [],
        isLoginMode: false,
        currentSort: 'default',
        userRoleFilter: 'all',
        categories: [...DEFAULT_CATEGORIES],
        hiddenCategories: [],
        adminMenuSearch: '',
        adminMenuCategoryFilter: 'all',
        adminMenuStatusFilter: 'all',
        auditLogs: [],
        storeOpen: true,
        storeSettings: { isOpen:true, temporaryClosed:false, closureMessage:'', weeklyHours:{}, dailyOrderCapacity:null },
        storeAcceptingOrders: true,
        storeStatusReason: '',
        customerMenuSearch: '',
        customerMenuCategory: 'all',
        customerMenuAvailability: 'available',
        customerMenuPrice: 'all',
        customerOrders: [],
        orderReportPage: 1
    };

    function revealAppWhenReady() {
        if (isAuthLoading || !isMenuBootstrapComplete || hasCommittedInitialRender) return;

        /* Commit the first visible interface only once. Keeping all expensive DOM
           and SVG work out of the hidden loading phase makes readiness noticeably
           faster on phones and slower laptops. */
        hasCommittedInitialRender = true;
        renderStoreStatus(false);
        renderCart();
        renderAuthBar();
        renderNavigation();
        renderMenu(false);
        renderAdminMenuTable(false);
        renderCategoryManager(undefined, false);
        if (window.lucide) lucide.createIcons();
        requestAnimationFrame(() => document.body.classList.remove('auth-pending'));
    }

    async function bootstrapMenu() {
        /* These documents are independent. Fetch them together, then commit and
           render one complete storefront instead of repainting after each read. */
        const [itemsResult, categoriesResult, storeResult] = await Promise.allSettled([
            getDocs(collection(db, "items")),
            getDoc(doc(db, "settings", "menuCategories")),
            getDoc(doc(db, "settings", "store"))
        ]);

        if (itemsResult.status === 'fulfilled') {
            const snapshot = itemsResult.value;
            menuData = snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() }));
            if (menuData.length) writeCachedMenu(menuData);
            else localStorage.removeItem(MENU_CACHE_KEY);
        } else {
            console.warn("Could not load Firestore items:", itemsResult.reason);
        }

        const itemCategories = menuData.map(item => item.category).filter(Boolean);
        if (categoriesResult.status === 'fulfilled') {
            const snapshot = categoriesResult.value;
            const savedCategories = snapshot.exists() && Array.isArray(snapshot.data().categories)
                ? snapshot.data().categories
                : DEFAULT_CATEGORIES;
            state.categories = [...new Set([...savedCategories, ...itemCategories])];
            state.hiddenCategories = snapshot.exists() && Array.isArray(snapshot.data().hiddenCategories)
                ? snapshot.data().hiddenCategories.filter(category => state.categories.includes(category))
                : [];
        } else {
            state.categories = [...new Set([...DEFAULT_CATEGORIES, ...itemCategories])];
            console.warn("Could not load menu categories:", categoriesResult.reason);
        }

        if (storeResult.status === 'fulfilled' && storeResult.value.exists()) {
            state.storeSettings = { ...state.storeSettings, ...storeResult.value.data() };
        }
        state.storeOpen = state.storeSettings.isOpen !== false;
        if (storeResult.status === 'rejected') {
            console.warn("Could not load store settings:", storeResult.reason);
        }

        isMenuLoading = false;
        isMenuBootstrapComplete = true;
        evaluateStoreAvailability();
        renderWeekdayHours();
        revealAppWhenReady();
    }

    window.addEventListener('DOMContentLoaded', async () => {
        const itemWorkspace = document.getElementById('menu-item-workspace-card');
        const itemModalBody = document.getElementById('item-editor-modal-body');
        if (itemWorkspace && itemModalBody) itemModalBody.appendChild(itemWorkspace);
        initTheme();
        bootstrapMenu();

        const modals = ['auth-modal', 'settings-modal', 'admin-user-edit-modal', 'guest-checkout-modal', 'item-customization-modal', 'item-editor-modal', 'category-manager-modal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (event) => {
                    if (event.target === el) {
                        el.classList.remove('active');
                    }
                });
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                toggleAuthModal(false);
                toggleSettingsModal(false);
                toggleAdminUserModal(false);
                toggleGuestCheckoutModal(false);
                toggleItemCustomizationModal(false);
            }
        });

    });

    onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser?.isAnonymous) {
            // Anonymous Authentication gives guest orders a private owner UID
            // without turning the guest into a customer account in the UI.
            state.currentUser = null;
            cachedAuthUser = null;
            writeCachedAuthUser(null);
        } else if (firebaseUser) {
            hadAuthenticatedSession = true;
            let savedProfile = null;
            try {
                const profileSnapshot = await getDoc(doc(db, "users", firebaseUser.uid));
                if (profileSnapshot.exists()) savedProfile = profileSnapshot.data();
            } catch (error) {
                console.warn("Could not load the Firestore profile:", error);
            }

            const localUser = state.users.find(u => u.email.toLowerCase() === firebaseUser.email.toLowerCase());
            state.currentUser = {
                uid: firebaseUser.uid,
                name: savedProfile?.name || localUser?.name || firebaseUser.displayName || firebaseUser.email.split('@')[0],
                email: firebaseUser.email,
                role: savedProfile?.role || localUser?.role || 'customer',
                phone: savedProfile?.phone || '',
                street: savedProfile?.street || '',
                city: savedProfile?.city || 'Peshawar',
                joined: savedProfile?.joined || localUser?.joined || ''
            };
            cachedAuthUser = state.currentUser;
            writeCachedAuthUser(state.currentUser);
        } else {
            const sessionEnded = hadAuthenticatedSession && !isAuthLoading;
            state.currentUser = null;
            cachedAuthUser = null;
            writeCachedAuthUser(null);
            switchPanel('portal');
            if (sessionEnded) triggerToast('Your session ended. Please sign in again to continue.', 'danger');
        }
        isAuthLoading = false;
        if (state.currentUser && (hasAdminAccess() || hasOrderManagerAccess())) {
            loadOrders();
            if (hasAdminAccess()) loadUsers();
            if (hasOrderManagerAccess()) switchPanel('orders');
            else if (state.currentUser.role === 'admin') switchPanel('admin');
            else if (state.currentUser.role === 'super_admin') switchPanel('overview');
        } else {
            state.orders = [];
            renderOrdersTable();
            loadCustomerOrderHistory();
        }
        revealAppWhenReady();
    });

    function initTheme() {
        const savedTheme = localStorage.getItem('snack-station-theme-v2');
        const theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeToggleButton(theme);
        initWorkspaceSidebar();
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('snack-station-theme-v2', newTheme);
        updateThemeToggleButton(newTheme);
    }

    function updateThemeToggleButton(theme) {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            toggleBtn.innerHTML = theme === 'light' ? `<i data-lucide="moon"></i>` : `<i data-lucide="sun"></i>`;
        }
        const sidebarToggle = document.getElementById('sidebar-theme-toggle-btn');
        if (sidebarToggle) sidebarToggle.innerHTML = theme === 'light'
            ? `<i data-lucide="moon"></i><span>Dark mode</span>`
            : `<i data-lucide="sun"></i><span>Light mode</span>`;
        lucide.createIcons();
    }

    function initWorkspaceSidebar() {
        const collapsed = localStorage.getItem('snack-station-sidebar') === 'collapsed';
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        updateWorkspaceCollapseButton(collapsed);
    }

    function toggleWorkspaceSidebar() {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('snack-station-sidebar', collapsed ? 'collapsed' : 'expanded');
        updateWorkspaceCollapseButton(collapsed);
    }

    function updateWorkspaceCollapseButton(collapsed) {
        const button = document.querySelector('.workspace-collapse-btn');
        if (!button) return;
        button.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        button.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }

    function hasAdminAccess(user = state.currentUser) {
        return Boolean(user && ['admin', 'super_admin'].includes(user.role));
    }

    function hasSuperAdminAccess(user = state.currentUser) {
        return Boolean(user && user.role === 'super_admin');
    }

    function hasOrderManagerAccess(user = state.currentUser) {
        return Boolean(user && user.role === 'order_manager');
    }

    function getOrderDate(order) {
        const value = order?.createdAt;
        if (!value) return null;
        if (typeof value?.toDate === 'function') return value.toDate();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function isOrderFromToday(order) {
        const orderDate = getOrderDate(order);
        if (!orderDate) return false;
        const today = new Date();
        return orderDate.getFullYear() === today.getFullYear()
            && orderDate.getMonth() === today.getMonth()
            && orderDate.getDate() === today.getDate();
    }

    function canManageUserProfile(user) {
        if (!user || !hasAdminAccess()) return false;
        if (hasSuperAdminAccess()) return true;
        return !['admin', 'super_admin'].includes(user.role);
    }

    function renderNavigation() {
        const role = state.currentUser ? state.currentUser.role : 'customer';
        const adminAccess = hasAdminAccess();
        const isStaff = adminAccess || hasOrderManagerAccess();
        document.body.classList.toggle('staff-workspace', isStaff);
        document.body.classList.toggle('role-order_manager', role === 'order_manager');
        document.body.classList.toggle('role-admin', role === 'admin');
        document.body.classList.toggle('role-super_admin', role === 'super_admin');
        document.getElementById('btn-orders').style.display = (hasOrderManagerAccess() || adminAccess) ? 'flex' : 'none';
        document.getElementById('btn-users').style.display = adminAccess ? 'flex' : 'none';
        document.getElementById('btn-admin').style.display = adminAccess ? 'flex' : 'none';
        document.getElementById('btn-audit').style.display = hasSuperAdminAccess() ? 'flex' : 'none';
        const superAdminRoleTab = document.getElementById('super-admin-role-tab');
        if (superAdminRoleTab) superAdminRoleTab.style.display = hasSuperAdminAccess() ? '' : 'none';

        const cartWrapper = document.getElementById('cart-dropdown-wrapper');
        const displayRole = state.currentUser?.role || (isAuthLoading ? cachedAuthUser?.role : null) || 'customer';
        const canUseCart = displayRole === 'customer';
        if (cartWrapper) cartWrapper.style.display = canUseCart ? 'block' : 'none';
        if (!canUseCart) document.getElementById('cart-pane-element')?.classList.add('hidden');
        const trackingButton = document.getElementById('track-order-header-btn');
        if (trackingButton) trackingButton.style.display = !state.currentUser && !isStaff ? 'inline-flex' : 'none';

        const sideVisibility = {
            overview: hasSuperAdminAccess(),
            orders: hasOrderManagerAccess() || adminAccess,
            admin: adminAccess,
            users: adminAccess,
            audit: hasSuperAdminAccess()
        };
        Object.entries(sideVisibility).forEach(([panel, visible]) => {
            const button = document.getElementById(`side-btn-${panel}`);
            if (button) button.style.display = visible ? 'flex' : 'none';
        });
    }

    function toggleWorkspaceMenu(forceOpen) {
        const shouldOpen = typeof forceOpen === 'boolean'
            ? forceOpen
            : !document.body.classList.contains('workspace-menu-open');
        document.body.classList.toggle('workspace-menu-open', shouldOpen);
        const opener = document.querySelector('.mobile-workspace-toggle');
        if (opener) {
            opener.setAttribute('aria-expanded', String(shouldOpen));
            opener.setAttribute('aria-label', shouldOpen ? 'Close workspace menu' : 'Open workspace menu');
        }
    }

    function handleLogoNavigation(event) {
        if (event) event.preventDefault();
        if (hasOrderManagerAccess()) return switchPanel('orders');
        if (state.currentUser?.role === 'admin') return switchPanel('admin');
        if (hasSuperAdminAccess()) return switchPanel('overview');
        switchPanel('portal');
    }

    function switchPanel(panelId) {
        const role = state.currentUser ? state.currentUser.role : 'customer';
        if (panelId === 'portal' && ['admin', 'order_manager', 'super_admin'].includes(role)) {
            return switchPanel(role === 'order_manager' ? 'orders' : role === 'super_admin' ? 'overview' : 'admin');
        }
        if (panelId === 'overview' && !hasSuperAdminAccess()) return;
        if (panelId === 'my-orders' && state.currentUser?.role !== 'customer') return;
        if (panelId === 'orders' && role === 'customer') return;
        if ((panelId === 'users' || panelId === 'admin') && !hasAdminAccess()) return;
        if (panelId === 'audit' && !hasSuperAdminAccess()) return;

        if (panelId === 'orders') loadOrders();
        if (panelId === 'users') loadUsers();
        if (panelId === 'audit') loadAuditLogs();
        if (panelId === 'overview') updateStaffOverview();

        document.body.classList.toggle('menu-page-active', panelId === 'portal' && !document.body.classList.contains('checkout-active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.top-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.workspace-nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`${panelId}-panel`).classList.add('active');
        const currentBtn = document.getElementById(`btn-${panelId}`);
        if (currentBtn && currentBtn.style.display !== 'none') currentBtn.classList.add('active');
        const sideBtn = document.getElementById(`side-btn-${panelId}`);
        if (sideBtn && sideBtn.style.display !== 'none') sideBtn.classList.add('active');
        document.body.classList.remove('workspace-menu-open');
        trackAnalyticsEvent('screen_view', {
            firebase_screen: panelId,
            firebase_screen_class: 'SnackStationWeb'
        });
    }

    function updateStaffOverview() {
        if (!hasSuperAdminAccess()) return;
        const now = new Date();
        const hour = now.getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName = (state.currentUser?.name || 'Super Admin').trim().split(/\s+/)[0];
        const orders = Array.isArray(state.orders) ? state.orders : [];
        const todayOrders = orders.filter(isOrderFromToday);
        const active = todayOrders.filter(order => ['new','pending','accepted','preparing','ready'].includes(String(order.status || '').toLowerCase()));
        const availableItems = menuData.filter(item => item.available !== false && item.hidden !== true).length;
        const team = state.users.filter(user => ['admin','order_manager'].includes(user.role)).length;
        document.getElementById('overview-greeting').textContent = `${greeting}, ${firstName}`;
        document.getElementById('overview-date').textContent = now.toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long', year:'numeric' });
        document.getElementById('overview-orders-today').textContent = todayOrders.length;
        document.getElementById('overview-orders-note').textContent = todayOrders.length ? `${todayOrders.filter(order => String(order.status).toLowerCase() === 'completed').length} completed today` : 'No orders yet today';
        document.getElementById('overview-active-orders').textContent = active.length;
        document.getElementById('overview-menu-items').textContent = menuData.length;
        document.getElementById('overview-menu-note').textContent = `${availableItems} currently available`;
        document.getElementById('overview-team-count').textContent = team;
        const recent = [...orders].sort((a,b) => (getOrderDate(b)?.getTime() || 0) - (getOrderDate(a)?.getTime() || 0)).slice(0,5);
        const list = document.getElementById('overview-order-list');
        list.innerHTML = recent.length ? recent.map(order => {
            const date = getOrderDate(order);
            const customer = order.customerName || order.customer?.name || order.name || 'Customer';
            const amount = Number(order.total || order.totalAmount || 0);
            return `<div class="overview-order-row"><div><strong>${escapeHtml(customer)}</strong><small>#${escapeHtml(String(order.orderNumber || order.id || '').slice(-8))} · ${date ? date.toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Date unavailable'}</small></div><span class="overview-status">${escapeHtml(order.status || 'new')}</span><strong>Rs. ${amount.toLocaleString()}</strong></div>`;
        }).join('') : '<div class="overview-empty">No orders to show yet.</div>';
        if (window.lucide) lucide.createIcons();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    }

    function triggerToast(message, type = "success") {
        const toast = document.getElementById('toast-box');
        const icon = document.getElementById('toast-icon');
        document.getElementById('toast-message').innerText = message;
        toast.style.borderLeftColor = type === 'danger' ? 'var(--danger)' : type === 'info' ? 'var(--info)' : 'var(--success)';
        icon.setAttribute('data-lucide', type === 'danger' ? 'circle-alert' : type === 'info' ? 'info' : 'circle-check');
        icon.style.color = type === 'danger' ? 'var(--danger)' : type === 'info' ? 'var(--info)' : 'var(--success)';
        if (window.lucide) lucide.createIcons();
        clearTimeout(toastTimer);
        toast.classList.add('show');
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    }

    function animateElement(element, className) {
        if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
        element.addEventListener('animationend', () => element.classList.remove(className), { once:true });
    }

    function updateCustomerGreeting() {
        const title = document.getElementById('customer-greeting');
        const note = document.getElementById('customer-greeting-note');
        if (!title || !note) return;
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName = String(state.currentUser?.name || '').trim().split(/\s+/)[0];
        title.textContent = firstName && state.currentUser?.role === 'customer' ? `${greeting}, ${firstName}` : 'Tasty Deliveries';
        note.textContent = state.storeAcceptingOrders ? 'Fresh favourites are ready when you are.' : 'Browse now and come back when the kitchen reopens.';
    }

    document.addEventListener('invalid', event => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
        field.classList.add('field-error');
        field.setAttribute('aria-invalid', 'true');
        let message = field.parentElement?.querySelector('.field-error-message');
        if (!message) {
            message = document.createElement('small');
            message.className = 'field-error-message';
            field.insertAdjacentElement('afterend', message);
        }
        message.textContent = field.validationMessage;
    }, true);

    document.addEventListener('input', event => {
        const field = event.target;
        if (!field?.classList?.contains('field-error')) return;
        if (field.checkValidity()) {
            field.classList.remove('field-error');
            field.removeAttribute('aria-invalid');
            field.parentElement?.querySelector('.field-error-message')?.remove();
        }
    });

    async function writeAuditLog(action, details = {}) {
        if (!state.currentUser || (!hasAdminAccess() && !hasOrderManagerAccess())) return;
        try {
            const auditRef = doc(collection(db, 'auditLogs'));
            const auditRecord = {
                action,
                details,
                actorId: state.currentUser.uid || null,
                actorName: state.currentUser.name || '',
                actorEmail: state.currentUser.email || '',
                actorRole: state.currentUser.role,
                createdAt: new Date().toISOString()
            };
            await setDoc(auditRef, auditRecord);
            state.auditLogs = [{ id: auditRef.id, ...auditRecord }, ...state.auditLogs.filter(log => log.id !== auditRef.id)].slice(0, 100);
            renderAuditLogs();
        } catch (error) {
            console.warn('Audit log could not be written:', error);
        }
    }

    async function loadAuditLogs() {
        if (!hasSuperAdminAccess()) return;
        const body = document.getElementById('audit-log-table-body');
        if (body) body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Loading audit records...</td></tr>';
        try {
            const snapshot = await getDocs(collection(db, 'auditLogs'));
            state.auditLogs = snapshot.docs.map(logDoc => ({ id: logDoc.id, ...logDoc.data() }))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
                .slice(0, 100);
            renderAuditLogs();
        } catch (error) {
            if (body) body.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--danger);">${error.message || 'Could not load audit records.'}</td></tr>`;
        }
    }

    function valuesEqual(first, second) {
        return JSON.stringify(first ?? null) === JSON.stringify(second ?? null);
    }

    function buildItemChangeSet(before, after) {
        const fields = {
            name: 'Name', price: 'Price', category: 'Category', img: 'Image URL', desc: 'Description',
            labels: 'Menu labels', variants: 'Size/options', addonGroups: 'Add-on groups', mealMode: 'Meal mode',
            mealItems: 'Meal components/substitutions', originalComponentPrice: 'Original component price'
        };
        return Object.entries(fields).reduce((changes, [key, label]) => {
            if (!valuesEqual(before?.[key], after?.[key])) changes[label] = { from: before?.[key] ?? null, to: after?.[key] ?? null };
            return changes;
        }, {});
    }

    function formatAuditValue(value, field = '') {
        if (value === null || value === undefined || value === '') return 'Not set';
        if (field.toLowerCase().includes('price') && typeof value === 'number') return `Rs. ${value.toLocaleString()}`;
        if (Array.isArray(value)) {
            if (!value.length) return 'None';
            return value.map(item => typeof item === 'object' ? (item.name || item.itemId || 'Configured item') : item).join(', ');
        }
        if (typeof value === 'object') return JSON.stringify(value).replace(/[<>]/g, '');
        return String(value).replace(/[<>]/g, '');
    }

    function formatAuditDetails(details = {}) {
        if (details.changes && Object.keys(details.changes).length) {
            return `<div style="display:grid; gap:6px;">${Object.entries(details.changes).map(([field, change]) => `<div><strong>${field}:</strong> <span style="color:var(--danger); text-decoration:line-through;">${formatAuditValue(change.from, field)}</span> <span style="color:var(--text-muted);">→</span> <span style="color:var(--success);">${formatAuditValue(change.to, field)}</span></div>`).join('')}</div>`;
        }
        const ignored = new Set(['itemId', 'orderId']);
        const entries = Object.entries(details).filter(([key]) => !ignored.has(key));
        return entries.length ? entries.map(([key, value]) => `<div><strong>${key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}:</strong> ${formatAuditValue(value, key)}</div>`).join('') : 'No additional details';
    }

    function renderAuditLogs() {
        const body = document.getElementById('audit-log-table-body');
        if (!body) return;
        const actionLabels = {
            'item.create':'Item created', 'item.update':'Item updated', 'item.delete':'Item deleted',
            'item.visibility_change':'Item visibility changed', 'item.sold_out_change':'Stock status changed',
            'category.create':'Category created', 'category.rename':'Category renamed', 'category.delete':'Category deleted',
            'category.reorder':'Categories reordered', 'category.visibility_change':'Category visibility changed',
            'store.status_change':'Store status changed', 'order.status_change':'Order status changed',
            'user.role_change':'User role changed', 'user.profile_update':'User profile updated',
            'user.password_reset_request':'Password reset requested'
        };
        body.innerHTML = state.auditLogs.length ? state.auditLogs.map(log => {
            const date = log.createdAt ? new Date(log.createdAt).toLocaleString() : '—';
            const details = formatAuditDetails(log.details || {});
            return `<tr><td>${date}</td><td><strong>${log.actorName || log.actorEmail || 'Unknown'}</strong><small style="display:block; color:var(--text-muted);">${log.actorRole || ''}</small></td><td>${actionLabels[log.action] || log.action}</td><td style="font-size:.75rem; min-width:280px;">${details}</td></tr>`;
        }).join('') : '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No audit records found.</td></tr>';
    }

    function toggleCartVisibility() {
        document.getElementById('cart-pane-element').classList.toggle('hidden');
    }

    function toggleAuthModal(show) {
        document.getElementById('auth-modal').classList.toggle('active', show);
        if (!show) document.getElementById('auth-form').reset();
    }
    function toggleSettingsModal(show) {
        document.getElementById('settings-modal').classList.toggle('active', show);
        if (show && state.currentUser) {
            document.getElementById('settings-username').value = state.currentUser.name || '';
            document.getElementById('settings-phone').value = state.currentUser.phone || '';
            document.getElementById('settings-street').value = state.currentUser.street || '';
            document.getElementById('settings-city').value = state.currentUser.city || 'Peshawar';
            document.getElementById('settings-password').value = '';
            const isCustomer = state.currentUser.role === 'customer';
            document.getElementById('customer-account-hub').style.display = isCustomer ? 'grid' : 'none';
            document.getElementById('customer-edit-heading').style.display = isCustomer ? 'flex' : 'none';
            document.getElementById('settings-form').style.display = isCustomer ? 'none' : 'block';
            document.getElementById('profile-view-name').textContent = state.currentUser.name || 'Not added';
            document.getElementById('profile-view-email').textContent = state.currentUser.email || 'Not added';
            document.getElementById('profile-view-phone').textContent = state.currentUser.phone || 'Not added';
            const address = [state.currentUser.street, state.currentUser.city].filter(Boolean).join(', ');
            document.getElementById('profile-view-address').textContent = address || 'Not added';
            document.querySelector('#settings-modal .modal-title').lastChild.textContent = isCustomer ? ' My Account' : ' Account Settings';
            lucide.createIcons();
        }
    }
    function setCustomerProfileEditing(editing) {
        if (state.currentUser?.role !== 'customer') return;
        document.getElementById('customer-account-hub').style.display = editing ? 'none' : 'grid';
        document.getElementById('settings-form').style.display = editing ? 'block' : 'none';
        if (!editing) toggleSettingsModal(true);
    }
    function openCustomerTrackingFromAccount() {
        toggleSettingsModal(false);
        openOrderTracking();
    }
    function openCustomerOrdersFromAccount() {
        toggleSettingsModal(false);
        switchPanel('my-orders');
    }
    function openSidebarSettings(event) {
        const sidebarAccount = document.getElementById('sidebar-auth-container');
        if (event?.detail > 0) sidebarAccount?.classList.add('profile-clicked');
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        toggleSettingsModal(true);
    }
    function toggleAdminUserModal(show) { document.getElementById('admin-user-edit-modal').classList.toggle('active', show); }
    function toggleGuestCheckoutModal(show) {
        document.getElementById('guest-checkout-modal').classList.toggle('active', show);
        if (!show) document.getElementById('guest-checkout-form').reset();
    }
    function toggleItemCustomizationModal(show) {
        document.getElementById('item-customization-modal').classList.toggle('active', show);
        if (!show) document.getElementById('item-customization-form').reset();
    }

    function toggleAuthMode(toLogin) {
        state.isLoginMode = toLogin;
        const title = document.getElementById('modal-title-text');
        const nameGrp = document.getElementById('username-group');
        title.innerText = toLogin ? "Welcome back to The Station" : "Create Your Station Profile";
        nameGrp.style.display = toLogin ? "none" : "block";
        document.getElementById('reg-username').required = !toLogin;
        document.getElementById('modal-toggle-desc').innerHTML = toLogin ? `Need an account? <span onclick="openSignupPage()">Create Account</span>` : `Already registered? <span onclick="toggleAuthMode(true)">Sign In</span>`;
    }

    function openSignupPage() {
        toggleAuthModal(false);
        switchPanel('signup');
    }

    function openSignInModal() {
        switchPanel('portal');
        toggleAuthMode(true);
        toggleAuthModal(true);
    }

    async function handleRegistrationSubmit(event) {
        event.preventDefault();
        const registrationForm = event.currentTarget;
        const submitButton = event.submitter || registrationForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        const profile = {
            name: document.getElementById('signup-name').value.trim(),
            email: document.getElementById('signup-email').value.trim(),
            phone: document.getElementById('signup-phone').value.trim(),
            street: document.getElementById('signup-address').value.trim(),
            city: document.getElementById('signup-city').value
        };
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        if (password !== confirmPassword) {
            triggerToast("Passwords do not match.", "danger");
            document.getElementById('signup-confirm-password').focus();
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Creating Account...';

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, profile.email, password);
            await updateProfile(userCredential.user, { displayName: profile.name });
            const now = new Date().toISOString();
            const newUserProfile = {
                uid: userCredential.user.uid,
                ...profile,
                joined: now.slice(0, 10),
                orderCount: 0,
                role: 'customer',
                createdAt: now,
                updatedAt: now
            };
            await setDoc(doc(db, "users", userCredential.user.uid), newUserProfile);
            state.currentUser = newUserProfile;
            cachedAuthUser = newUserProfile;
            writeCachedAuthUser(newUserProfile);
            registrationForm.reset();
            switchPanel('portal');
            renderAuthBar();
            renderNavigation();
            triggerToast("Account created successfully!");
        } catch (error) {
            const friendlyErrors = {
                'auth/email-already-in-use': 'An account already exists with this email. Please sign in.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/weak-password': 'Password must contain at least 6 characters.',
                'auth/network-request-failed': 'Network error. Please check your connection.'
            };
            triggerToast(friendlyErrors[error.code] || error.message || 'Could not create the account.', "danger");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    }

    async function handleAuthSubmit(e) {
        e.preventDefault();
        const submitButton = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        const emailInput = document.getElementById('reg-email').value.trim();
        const passwordInput = document.getElementById('reg-password').value;
        const usernameInput = document.getElementById('reg-username').value.trim();

        submitButton.disabled = true;
        submitButton.textContent = state.isLoginMode ? 'Signing In...' : 'Creating Account...';

        try {
            if (state.isLoginMode) {
                const userCredential = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
                const firebaseUser = userCredential.user;
                const knownUser = state.users.find(user =>
                    user.uid === firebaseUser.uid ||
                    String(user.email || '').toLowerCase() === String(firebaseUser.email || '').toLowerCase()
                );
                state.currentUser = {
                    uid: firebaseUser.uid,
                    name: knownUser?.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Customer',
                    email: firebaseUser.email || knownUser?.email || '',
                    role: knownUser?.role || 'customer',
                    phone: knownUser?.phone || '',
                    street: knownUser?.street || '',
                    city: knownUser?.city || 'Peshawar',
                    joined: knownUser?.joined || ''
                };
                cachedAuthUser = state.currentUser;
                writeCachedAuthUser(state.currentUser);
                renderAuthBar();
                renderNavigation();
                toggleAuthModal(false);
                triggerToast("Signed in successfully!");
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
                await updateProfile(userCredential.user, { displayName: usernameInput });

                const newUserProfile = {
                    uid: userCredential.user.uid,
                    name: usernameInput,
                    email: emailInput,
                    joined: new Date().toISOString().slice(0, 10),
                    orderCount: 0,
                    role: "customer",
                    phone: "",
                    street: "",
                    city: "Peshawar",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                try {
                    await setDoc(doc(db, "users", userCredential.user.uid), newUserProfile);
                } catch (profileError) {
                    console.warn("Account created, but the Firestore profile could not be saved:", profileError);
                }
                if (!state.users.some(user => user.uid === newUserProfile.uid)) {
                    state.users.push({ id: `U-${Math.floor(1000 + Math.random() * 9000)}`, ...newUserProfile });
                }
                if (typeof renderUsersTable === 'function') renderUsersTable();
                toggleAuthModal(false);
                triggerToast("Account created successfully!");
            }
        } catch (error) {
            const friendlyErrors = {
                'auth/email-already-in-use': 'An account already exists with this email. Please sign in.',
                'auth/invalid-credential': 'Incorrect email or password.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/weak-password': 'Password must contain at least 6 characters.',
                'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
                'auth/network-request-failed': 'Network error. Please check your connection.'
            };
            triggerToast(friendlyErrors[error.code] || error.message || 'Authentication failed.', "danger");
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    }

    async function handleSettingsUpdate(e) {
        e.preventDefault();
        const newName = document.getElementById('settings-username').value.trim();
        const newPhone = document.getElementById('settings-phone').value.trim();
        const newStreet = document.getElementById('settings-street').value.trim();
        const newCity = document.getElementById('settings-city').value;
        const newPassword = document.getElementById('settings-password').value;
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;
        try {
            const updatedProfile = {
                uid: firebaseUser.uid,
                name: newName,
                email: firebaseUser.email,
                phone: newPhone,
                street: newStreet,
                city: newCity,
                updatedAt: new Date().toISOString()
            };

            await setDoc(doc(db, "users", firebaseUser.uid), updatedProfile, { merge: true });
            await updateProfile(firebaseUser, { displayName: newName });
            if (newPassword) await updatePassword(firebaseUser, newPassword);

            state.currentUser.name = newName;
            state.currentUser.phone = newPhone;
            state.currentUser.street = newStreet;
            state.currentUser.city = newCity;
            cachedAuthUser = state.currentUser;
            writeCachedAuthUser(state.currentUser);
            renderAuthBar();
            if (state.currentUser.role === 'customer') {
                setCustomerProfileEditing(false);
                toggleSettingsModal(true);
            } else {
                toggleSettingsModal(false);
            }
            triggerToast("Profile updated!");
        } catch (error) {
            const message = error.code === 'auth/requires-recent-login'
                ? 'Please sign out and sign in again before changing your password.'
                : (error.message || 'Could not update the profile.');
            triggerToast(message, "danger");
        }
    }

    function renderAuthBar() {
        const container = document.getElementById('auth-bar-container');
        const sidebarContainer = document.getElementById('sidebar-auth-container');
        const displayUser = state.currentUser || (isAuthLoading ? cachedAuthUser : null);
        if (displayUser) {
            container.className = state.currentUser ? "auth-bar interactive" : "auth-bar";
            container.innerHTML = `
                <div class="user-welcome-info" ${state.currentUser ? 'onclick="toggleSettingsModal(true)"' : ''}>
                    <div class="user-avatar">
                        ${String(displayUser.name || displayUser.email || 'U').trim().charAt(0).toUpperCase()}
                    </div>
                    <div class="user-welcome-text">
                        <h4>${escapeHtml(displayUser.name || displayUser.email || 'Account')}</h4>
                    </div>
                </div>
            `;
            if (sidebarContainer) {
                sidebarContainer.innerHTML = container.innerHTML;
                sidebarContainer.classList.toggle('interactive', Boolean(state.currentUser));
                sidebarContainer.classList.remove('profile-clicked');
                sidebarContainer.onmouseleave = () => sidebarContainer.classList.remove('profile-clicked');
                sidebarContainer.onclick = state.currentUser ? (event) => openSidebarSettings(event) : null;
                sidebarContainer.setAttribute('role', state.currentUser ? 'button' : 'presentation');
                sidebarContainer.setAttribute('tabindex', state.currentUser ? '0' : '-1');
                sidebarContainer.setAttribute('aria-label', state.currentUser ? 'Open account settings' : '');
                sidebarContainer.onkeydown = state.currentUser
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openSidebarSettings(event);
                        }
                    }
                    : null;
                const sidebarProfile = sidebarContainer.querySelector('.user-welcome-info');
                if (sidebarProfile && state.currentUser) {
                    sidebarProfile.setAttribute('onclick', 'openSidebarSettings(event)');
                    sidebarProfile.setAttribute('role', 'button');
                    sidebarProfile.setAttribute('tabindex', '0');
                    sidebarProfile.setAttribute('onkeydown', "if(event.key==='Enter'||event.key===' '){event.preventDefault();openSidebarSettings(event)}");
                }
            }
        } else if (isAuthLoading) {
            container.className = "auth-bar";
            container.innerHTML = `
                <div style="width:32px; height:32px; border-radius:50%; background:var(--border-color);"></div>
                <div class="user-welcome-text" style="width:90px;">
                    <div style="height:8px; width:55%; background:var(--border-color); border-radius:6px; margin-bottom:7px;"></div>
                    <div style="height:11px; width:100%; background:var(--border-color); border-radius:6px;"></div>
                </div>
            `;
            if (sidebarContainer) {
                sidebarContainer.innerHTML = container.innerHTML;
                sidebarContainer.classList.remove('interactive');
            }
        } else {
            container.className = "auth-bar";
            container.innerHTML = `
                <button class="btn-primary account-access-button" onclick="toggleAuthModal(true); toggleAuthMode(true);" aria-label="Sign in or create an account">
                    <i data-lucide="user-round"></i><span>Account</span>
                </button>
            `;
            if (sidebarContainer) {
                sidebarContainer.innerHTML = '';
                sidebarContainer.classList.remove('interactive');
            }
        }
        if (sidebarContainer && displayUser) sidebarContainer.querySelector('.user-welcome-info')?.setAttribute('title', 'Account settings');
        updateCustomerGreeting();
    }

    function getStockQuantity(item) {
        if (item?.stockQuantity === null || item?.stockQuantity === undefined || item?.stockQuantity === '') return null;
        const quantity = Number(item.stockQuantity);
        return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : null;
    }

    function isBasicItemAvailable(item) {
        const stock = getStockQuantity(item);
        return Boolean(item) && item.isVisible !== false && !item.isSoldOut && stock !== 0 && !state.hiddenCategories.includes(item.category);
    }

    async function handleGoogleSignIn(buttonId = 'google-auth-btn') {
        const button = document.getElementById(buttonId);
        if (!button) return;
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.textContent = 'Connecting to Google...';

        try {
            const result = await signInWithPopup(auth, googleProvider);
            const firebaseUser = result.user;
            const profileRef = doc(db, "users", firebaseUser.uid);
            const profileSnapshot = await getDoc(profileRef);

            if (!profileSnapshot.exists()) {
                const now = new Date().toISOString();
                await setDoc(profileRef, {
                    uid: firebaseUser.uid,
                    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Customer',
                    email: firebaseUser.email || '',
                    photoURL: firebaseUser.photoURL || '',
                    phone: firebaseUser.phoneNumber || '',
                    street: '',
                    city: 'Peshawar',
                    joined: now.slice(0, 10),
                    orderCount: 0,
                    role: 'customer',
                    authProvider: 'google.com',
                    createdAt: now,
                    updatedAt: now
                });
            }

            toggleAuthModal(false);
            switchPanel('portal');
            triggerToast(`Welcome${firebaseUser.displayName ? `, ${firebaseUser.displayName.split(' ')[0]}` : ''}!`);
        } catch (error) {
            const friendlyErrors = {
                'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
                'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Please allow pop-ups and try again.',
                'auth/cancelled-popup-request': 'A Google sign-in window is already open.',
                'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication.',
                'auth/account-exists-with-different-credential': 'An account already exists with this email. Sign in using its original method first.',
                'auth/network-request-failed': 'Network error. Please check your connection.'
            };
            if (error.code !== 'auth/cancelled-popup-request') {
                triggerToast(friendlyErrors[error.code] || error.message || 'Google sign-in failed.', 'danger');
            }
        } finally {
            button.disabled = false;
            button.innerHTML = originalContent;
        }
    }

    function isMenuItemAvailable(item) {
        if (!isBasicItemAvailable(item)) return false;
        if (!Array.isArray(item.mealItems) || !item.mealItems.length) return true;
        return item.mealItems.every(component => {
            const candidateIds = [component.itemId, ...(Array.isArray(component.substituteItemIds) ? component.substituteItemIds : [])];
            return candidateIds.some(candidateId => isBasicItemAvailable(menuData.find(menuItem => String(menuItem.id) === String(candidateId))));
        });
    }

    function renderMenu(refreshIcons = true) {
        syncCustomerCategoryFilter();
        const container = document.getElementById('menu-container');
        const categoryNav = document.getElementById('customer-category-nav');
        const displayRole = state.currentUser?.role || (isAuthLoading ? cachedAuthUser?.role : null) || 'customer';
        const canAddToCart = displayRole === 'customer';
        if (isMenuLoading && menuData.length === 0) {
            if (categoryNav) categoryNav.innerHTML = '';
            container.innerHTML = `<div class="grid-autofit">${Array.from({ length: 4 }, () => `
                    <div class="menu-card" aria-label="Loading menu item">
                        <div class="menu-img" style="background:linear-gradient(90deg,var(--bg-input),var(--border-color),var(--bg-input)); background-size:200% 100%; animation:menuLoading 1.2s infinite;"></div>
                        <div class="menu-info">
                            <div style="height:18px; width:72%; border-radius:8px; background:var(--bg-input); margin-bottom:12px;"></div>
                            <div style="height:12px; width:100%; border-radius:8px; background:var(--bg-input); margin-bottom:8px;"></div>
                            <div style="height:12px; width:60%; border-radius:8px; background:var(--bg-input);"></div>
                        </div>
                    </div>
                `).join('')}</div>`;
            return;
        }

        const now = Date.now();
        const visibleMenuItems = menuData.filter(item => {
            const starts = item.availableFrom ? new Date(item.availableFrom).getTime() : 0;
            const ends = item.availableUntil ? new Date(item.availableUntil).getTime() : Infinity;
            const scheduledNow = (!starts || starts <= now) && (!ends || ends >= now);
            const searchable = `${item.name || ''} ${item.desc || ''} ${item.category || ''}`.toLowerCase();
            return item.isVisible !== false
                && !state.hiddenCategories.includes(item.category)
                && scheduledNow
                && (!state.customerMenuSearch || searchable.includes(state.customerMenuSearch.toLowerCase()))
                && (state.customerMenuCategory === 'all' || item.category === state.customerMenuCategory)
                && (state.customerMenuAvailability === 'all' || isMenuItemAvailable(item))
                && (state.customerMenuPrice === 'all' || Number(item.price) <= Number(state.customerMenuPrice));
        });
        if (state.currentSort === 'price-asc') visibleMenuItems.sort((a, b) => Number(a.price) - Number(b.price));
        if (state.currentSort === 'price-desc') visibleMenuItems.sort((a, b) => Number(b.price) - Number(a.price));
        if (state.currentSort === 'alpha-asc') visibleMenuItems.sort((a, b) => a.name.localeCompare(b.name));
        if (state.currentSort === 'alpha-desc') visibleMenuItems.sort((a, b) => b.name.localeCompare(a.name));

        const renderCustomerMenuCards = items => items.map(item => `
            <div class="menu-card ${!isMenuItemAvailable(item) ? 'sold-out' : ''}" ${!isMenuItemAvailable(item) ? '' : `onclick='openItemCustomization(${JSON.stringify(String(item.id))})' role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openItemCustomization(${JSON.stringify(String(item.id))})}"`}>
                <img class="menu-img" src="${item.img}" alt="${item.name}">
                ${Array.isArray(item.labels) && item.labels.length ? `<div class="menu-labels">${item.labels.map(label => `<span class="menu-label ${label.toLowerCase()}">${label}</span>`).join('')}</div>` : ''}
                ${!isMenuItemAvailable(item) ? '<span class="sold-out-badge">Unavailable</span>' : ''}
                <span class="menu-badge">${item.category}</span>
                <div class="menu-info">
                    <h4 class="menu-title">${item.name}</h4>
                    <p class="menu-desc">${item.desc}</p>
                    <div class="menu-footer">
                        <span class="menu-price">Rs. ${Number(item.price).toLocaleString()}${calculateMealOriginalPrice(item.mealItems) > Number(item.price) ? `<small style="display:block; color:var(--success); font-size:.65rem;">Save Rs. ${(calculateMealOriginalPrice(item.mealItems) - Number(item.price)).toLocaleString()}</small>` : ''}</span>
                        ${canAddToCart && state.storeOpen && isMenuItemAvailable(item) ? `<button class="btn-add-cart" onclick='event.stopPropagation();quickAddToCart(${JSON.stringify(String(item.id))})' aria-label="Quick add to basket"><i data-lucide="plus" style="width:18px;"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        if (visibleMenuItems.length) {
            if (state.currentSort !== 'default') {
                if (categoryNav) categoryNav.innerHTML = '';
                container.innerHTML = `
                    <section class="menu-category-section">
                        <div class="menu-category-heading">
                            <h4>All Menu Items</h4>
                            <span class="menu-category-count">${visibleMenuItems.length} ${visibleMenuItems.length === 1 ? 'item' : 'items'}</span>
                        </div>
                        <div class="grid-autofit">${renderCustomerMenuCards(visibleMenuItems)}</div>
                    </section>`;
                if (refreshIcons) lucide.createIcons();
                return;
            }

            const categoryOrder = state.categories;
            const groupedItems = visibleMenuItems.reduce((groups, item) => {
                const category = item.category || 'Other';
                if (!groups[category]) groups[category] = [];
                groups[category].push(item);
                return groups;
            }, {});
            const populatedCategories = Object.keys(groupedItems).sort((a, b) => {
                const aIndex = categoryOrder.indexOf(a);
                const bIndex = categoryOrder.indexOf(b);
                if (aIndex !== -1 || bIndex !== -1) {
                    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                }
                return a.localeCompare(b);
            });

            if (categoryNav) {
                categoryNav.innerHTML = populatedCategories.map((category, index) => `
                    <button class="customer-category-link${index === 0 ? ' active' : ''}" type="button" data-category-index="${index}" onclick="scrollToMenuCategory(${index}, this)"${index === 0 ? ' aria-current="true"' : ''}>
                        ${escapeHtml(category)}
                    </button>
                `).join('');
            }

            container.innerHTML = populatedCategories.map((category, index) => `
                <section class="menu-category-section" id="menu-category-${index}">
                    <div class="menu-category-heading">
                        <h4>${escapeHtml(category)}</h4>
                        <span class="menu-category-count">${groupedItems[category].length} ${groupedItems[category].length === 1 ? 'item' : 'items'}</span>
                    </div>
                    <div class="grid-autofit">
                        ${renderCustomerMenuCards(groupedItems[category])}
                    </div>
                </section>
            `).join('');
            setupMenuCategoryScrollSpy();
        } else {
            if (categoryNav) categoryNav.innerHTML = '';
            container.innerHTML = `<div class="card" style="text-align:center; color:var(--text-muted); padding:3rem;">
                <i data-lucide="utensils" style="width:36px; height:36px; margin-bottom:12px;"></i>
                <h3 style="color:var(--text-main); margin-bottom:6px;">Menu coming soon</h3>
                <p>No menu items are currently available.</p>
            </div>`;
        }
        if (refreshIcons) lucide.createIcons();
    }

    function openItemCustomization(itemId) {
        const item = menuData.find(menuItem => String(menuItem.id) === String(itemId));
        if (!item || !isMenuItemAvailable(item)) return;
        trackAnalyticsEvent('view_item', {
            currency: 'PKR',
            value: Number(item.price || 0),
            items: [analyticsItem(item)]
        });
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const addonGroups = Array.isArray(item.addonGroups) && item.addonGroups.length
            ? item.addonGroups
            : (Array.isArray(item.addons) && item.addons.length
                ? [{ name: 'Extras', required: false, multiple: true, defaultOptionIndex: -1, options: item.addons }]
                : []);

        document.getElementById('customization-item-id').value = String(item.id);
        document.getElementById('customization-item-title').textContent = item.name;
        document.getElementById('customization-item-image').src = item.img || '';
        document.getElementById('customization-item-description').textContent = item.desc || '';
        const originalMealPrice = calculateMealOriginalPrice(item.mealItems);
        const savingsElement = document.getElementById('customization-savings');
        const mealSavings = Math.max(0, originalMealPrice - Number(item.price));
        savingsElement.style.display = mealSavings ? 'block' : 'none';
        savingsElement.textContent = mealSavings ? `Combo value Rs. ${originalMealPrice.toLocaleString()} · You save Rs. ${mealSavings.toLocaleString()}` : '';
        document.getElementById('customization-instructions').value = '';
        const mealItemsContainer = document.getElementById('customization-meal-items');
        const includedMealItems = Array.isArray(item.mealItems) ? item.mealItems : [];
        mealItemsContainer.style.display = includedMealItems.length ? 'block' : 'none';
        mealItemsContainer.innerHTML = includedMealItems.length ? `
            <div class="meal-included-list">
                <h4>Included in this meal</h4>
                <div style="display:grid; gap:9px; margin-top:9px;">${includedMealItems.map((mealItem, componentIndex) => {
                    const candidateIds = [mealItem.itemId, ...(Array.isArray(mealItem.substituteItemIds) ? mealItem.substituteItemIds : [])];
                    const candidates = candidateIds.map(candidateId => menuData.find(menuItem => String(menuItem.id) === String(candidateId))).filter(isBasicItemAvailable);
                    return `<label style="font-size:.75rem; color:var(--text-muted);">${Number(mealItem.quantity || 1)} × component
                        <select name="meal-substitution-${componentIndex}" style="margin-top:5px; width:100%;">${candidates.map(candidate => `<option value="${candidate.id}">${candidate.name}</option>`).join('')}</select>
                    </label>`;
                }).join('')}</div>
            </div>
        ` : '';
        document.getElementById('customization-quantity').textContent = '1';
        const canAdd = (!state.currentUser || state.currentUser.role === 'customer') && state.storeOpen;
        document.getElementById('customization-add-button').style.display = canAdd ? 'flex' : 'none';
        document.getElementById('customization-quantity-section').style.display = canAdd ? 'block' : 'none';
        const variantSection = document.getElementById('customization-variants-section');
        const addonSection = document.getElementById('customization-addons-section');

        variantSection.style.display = variants.length ? 'block' : 'none';
        variantSection.innerHTML = variants.length ? `
            <div class="customization-section-header">
                <h4><i data-lucide="layers-3" style="width:17px; color:var(--accent);"></i> Choose an option</h4>
                <span>Required · Select one</span>
            </div>
            <div class="customization-option-list">
                ${variants.map((variant, index) => `
                    <label class="option-choice">
                        <input type="radio" name="item-variant" value="${index}" ${index === 0 ? 'checked' : ''} onchange="updateCustomizationTotal()">
                        <span><strong>${variant.name}</strong></span>
                        <strong class="option-price-badge">${Number(variant.priceAdjustment || 0) ? `+ Rs. ${Number(variant.priceAdjustment).toLocaleString()}` : 'Included'}</strong>
                    </label>
                `).join('')}
            </div>
        ` : '';

        addonSection.style.display = addonGroups.length ? 'block' : 'none';
        addonSection.innerHTML = addonGroups.length ? addonGroups.map((group, groupIndex) => `
            <div class="form-group addon-customer-group" data-group-index="${groupIndex}" data-min="${Number(group.minSelections ?? (group.required ? 1 : 0))}" data-max="${Number(group.maxSelections ?? (group.multiple ? Math.max(1, group.options?.length || 1) : 1))}">
                <div class="customization-section-header">
                    <h4><i data-lucide="circle-plus" style="width:17px; color:var(--accent);"></i> ${group.name}</h4>
                    <span>${Number(group.minSelections ?? (group.required ? 1 : 0)) > 0 ? `Choose at least ${Number(group.minSelections ?? 1)}` : 'Optional'} · Up to ${Number(group.maxSelections ?? (group.multiple ? Math.max(1, group.options?.length || 1) : 1))}</span>
                </div>
                <div class="customization-option-list">
                    ${(Number(group.minSelections ?? (group.required ? 1 : 0)) === 0 && !group.multiple) ? `
                        <label class="option-choice">
                            <input type="radio" name="addon-group-${groupIndex}" value="" ${Number(group.defaultOptionIndex) < 0 ? 'checked' : ''} onchange="handleAddonSelection(${groupIndex}, this)">
                            <span><strong>No, thanks</strong></span>
                            <strong class="option-price-badge">Included</strong>
                        </label>
                    ` : ''}
                    ${(Array.isArray(group.options) ? group.options : []).map((addon, optionIndex) => `
                        <label class="option-choice">
                            <input type="${group.multiple ? 'checkbox' : 'radio'}" name="addon-group-${groupIndex}" value="${optionIndex}" ${optionIndex === Number(group.defaultOptionIndex) ? 'checked' : ''} onchange="handleAddonSelection(${groupIndex}, this)">
                            <span><strong>${addon.name}</strong></span>
                            <strong class="option-price-badge">${Number(addon.priceAdjustment || 0) ? `+ Rs. ${Number(addon.priceAdjustment).toLocaleString()}` : 'Included'}</strong>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('') : '';

        updateCustomizationTotal();
        toggleItemCustomizationModal(true);
        lucide.createIcons();
    }

    function quickAddToCart(itemId) {
        const item = menuData.find(menuItem => String(menuItem.id) === String(itemId));
        if (!item || !isMenuItemAvailable(item) || !state.storeOpen) return;
        if (Array.isArray(item.mealItems) && item.mealItems.some(component => (component.substituteItemIds?.length || !isBasicItemAvailable(menuData.find(menuItem => String(menuItem.id) === String(component.itemId)))))) {
            openItemCustomization(itemId);
            triggerToast('Choose the meal components before adding this item.');
            return;
        }
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const addonGroups = Array.isArray(item.addonGroups) ? item.addonGroups : [];
        const selectedVariant = variants[0] || null;
        const selectedAddons = [];

        for (const group of addonGroups) {
            const minSelections = Number(group.minSelections ?? (group.required ? 1 : 0));
            if (minSelections === 0) continue;
            const options = Array.isArray(group.options) ? group.options : [];
            const defaultOption = options[Number(group.defaultOptionIndex)] || options[0];
            if (!defaultOption || minSelections > 1) {
                openItemCustomization(itemId);
                triggerToast(`Please configure ${group.name} before adding this item.`, "danger");
                return;
            }
            selectedAddons.push({ ...defaultOption, groupName: group.name });
        }

        addToCart(itemId, { selectedVariant, selectedAddons }, 1);
    }

    function getCurrentCustomization() {
        const itemId = document.getElementById('customization-item-id').value;
        const item = menuData.find(menuItem => String(menuItem.id) === itemId);
        if (!item) return null;
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const addonGroups = Array.isArray(item.addonGroups) && item.addonGroups.length
            ? item.addonGroups
            : (Array.isArray(item.addons) && item.addons.length
                ? [{ name: 'Extras', required: false, multiple: true, options: item.addons }]
                : []);
        const selectedVariantInput = document.querySelector('input[name="item-variant"]:checked');
        const selectedVariant = selectedVariantInput ? variants[Number(selectedVariantInput.value)] : null;
        const selectedAddons = [];
        addonGroups.forEach((group, groupIndex) => {
            document.querySelectorAll(`input[name="addon-group-${groupIndex}"]:checked`).forEach(input => {
                if (input.value === '') return;
                const option = group.options?.[Number(input.value)];
                if (option) selectedAddons.push({ ...option, groupName: group.name });
            });
        });
        const selectedMealItems = (Array.isArray(item.mealItems) ? item.mealItems : []).map((component, componentIndex) => {
            const selectedId = document.querySelector(`select[name="meal-substitution-${componentIndex}"]`)?.value || component.itemId;
            const selectedItem = menuData.find(menuItem => String(menuItem.id) === String(selectedId));
            return { itemId: selectedId, name: selectedItem?.name || component.name, quantity: Number(component.quantity || 1) };
        });
        const instructions = document.getElementById('customization-instructions')?.value.trim() || '';
        return { item, selectedVariant, selectedAddons, addonGroups, selectedMealItems, instructions };
    }

    function handleAddonSelection(groupIndex, changedInput) {
        const groupElement = document.querySelector(`.addon-customer-group[data-group-index="${groupIndex}"]`);
        if (!groupElement) return;
        const maxSelections = Number(groupElement.dataset.max || 1);
        const selectedInputs = [...document.querySelectorAll(`input[name="addon-group-${groupIndex}"]:checked`)].filter(input => input.value !== '');
        if (selectedInputs.length > maxSelections) {
            changedInput.checked = false;
            triggerToast(`You can select up to ${maxSelections} option${maxSelections === 1 ? '' : 's'} in this group.`, "danger");
        }
        updateCustomizationTotal();
    }

    function getCustomizationSelectionError(customization) {
        for (let groupIndex = 0; groupIndex < customization.addonGroups.length; groupIndex += 1) {
            const group = customization.addonGroups[groupIndex];
            const minSelections = Number(group.minSelections ?? (group.required ? 1 : 0));
            const maxSelections = Number(group.maxSelections ?? (group.multiple ? Math.max(1, group.options?.length || 1) : 1));
            const selectedCount = [...document.querySelectorAll(`input[name="addon-group-${groupIndex}"]:checked`)].filter(input => input.value !== '').length;
            if (selectedCount < minSelections) return `Please select at least ${minSelections} option${minSelections === 1 ? '' : 's'} for ${group.name}.`;
            if (selectedCount > maxSelections) return `Please select no more than ${maxSelections} option${maxSelections === 1 ? '' : 's'} for ${group.name}.`;
        }
        return '';
    }

    function updateCustomizationTotal() {
        const customization = getCurrentCustomization();
        if (!customization) return;
        const quantity = Number(document.getElementById('customization-quantity').textContent || 1);
        const unitPrice = Number(customization.item.price) + Number(customization.selectedVariant?.priceAdjustment || 0) +
            customization.selectedAddons.reduce((sum, addon) => sum + Number(addon.priceAdjustment || 0), 0);
        const total = unitPrice * quantity;
        document.getElementById('customization-total').textContent = `Rs. ${total.toLocaleString()}`;
    }

    function changeCustomizationQuantity(delta) {
        const quantityElement = document.getElementById('customization-quantity');
        const currentQuantity = Number(quantityElement.textContent || 1);
        quantityElement.textContent = String(Math.max(1, Math.min(20, currentQuantity + delta)));
        updateCustomizationTotal();
    }

    function confirmCustomizedItem(event) {
        event.preventDefault();
        const customization = getCurrentCustomization();
        if (!customization) return;
        const selectionError = getCustomizationSelectionError(customization);
        if (selectionError) {
            triggerToast(selectionError, "danger");
            return;
        }
        const quantity = Number(document.getElementById('customization-quantity').textContent || 1);
        addToCart(customization.item.id, {
            selectedVariant: customization.selectedVariant,
            selectedAddons: customization.selectedAddons,
            selectedMealItems: customization.selectedMealItems,
            instructions: customization.instructions
        }, quantity);
        toggleItemCustomizationModal(false);
    }

    function addToCart(itemId, customization = {}, quantity = 1) {
        if (state.currentUser && state.currentUser.role !== 'customer') return;
        const foundItem = menuData.find(i => String(i.id) === String(itemId));
        if (!foundItem || !isMenuItemAvailable(foundItem) || !state.storeOpen) return;
        const selectedVariant = customization.selectedVariant || null;
        const selectedAddons = customization.selectedAddons || [];
        const selectedMealItems = customization.selectedMealItems || (Array.isArray(foundItem.mealItems) ? foundItem.mealItems : []);
        const instructions = String(customization.instructions || '').trim();
        const optionKey = [selectedVariant?.name || 'standard', ...selectedAddons.map(addon => addon.name).sort(), ...selectedMealItems.map(item => item.itemId), instructions.toLowerCase()].join('|');
        const cartKey = `${itemId}::${optionKey}`;
        const finalPrice = Number(foundItem.price) + Number(selectedVariant?.priceAdjustment || 0) +
            selectedAddons.reduce((sum, addon) => sum + Number(addon.priceAdjustment || 0), 0);
        const cartItemIndex = state.cart.findIndex(c => c.cartKey === cartKey);
        if(cartItemIndex > -1) state.cart[cartItemIndex].qty += quantity;
        else state.cart.push({
            ...foundItem,
            cartKey,
            basePrice: Number(foundItem.price),
            price: finalPrice,
            selectedVariant,
            selectedAddons,
            selectedMealItems,
            instructions,
            qty: quantity
        });
        renderCart();
        trackAnalyticsEvent('add_to_cart', {
            currency: 'PKR',
            value: Number(finalPrice) * Number(quantity),
            items: [analyticsItem({ ...foundItem, price: finalPrice }, quantity)]
        });
        triggerToast(`${foundItem.name} added to basket!`);
    }

    function renderCart() {
        const cartCount = state.cart.reduce((sum, item) => sum + item.qty, 0);
        const badge = document.getElementById('cart-toggle-badge');
        badge.innerText = cartCount;
        if (cartCount !== previousCartCount) animateElement(badge, 'cart-feedback');
        previousCartCount = cartCount;
        const cartContainer = document.getElementById('cart-container');
        cartContainer.innerHTML = state.cart.length ? state.cart.map((item, index) => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    ${item.selectedVariant ? `<small style="display:block; color:var(--text-muted); margin-top:3px;">${item.selectedVariant.name}</small>` : ''}
                    ${item.selectedAddons?.length ? `<small style="display:block; color:var(--text-muted); margin-top:3px;">+ ${item.selectedAddons.map(addon => addon.name).join(', ')}</small>` : ''}
                    ${item.selectedMealItems?.length ? `<small style="display:block; color:var(--text-muted); margin-top:3px;">Includes: ${item.selectedMealItems.map(component => `${component.quantity}× ${component.name}`).join(', ')}</small>` : ''}
                    ${item.instructions ? `<small style="display:block; color:var(--warning); margin-top:4px;">Note: ${item.instructions}</small>` : ''}
                    <p>Rs. ${Number(item.price).toLocaleString()}</p>
                </div>
                <div class="cart-qty-controls">
                    <button type="button" class="cart-qty-btn" data-cart-action="decrease" data-cart-index="${index}" aria-label="Decrease ${escapeHtml(item.name)} quantity">−</button>
                    <span>${item.qty}</span>
                    <button type="button" class="cart-qty-btn" data-cart-action="increase" data-cart-index="${index}" aria-label="Increase ${escapeHtml(item.name)} quantity">+</button>
                </div>
            </div>
        `).join('') : `<div class="empty-state-alive"><i data-lucide="shopping-basket"></i><strong>Your basket is ready</strong><span>Add something delicious from the menu.</span></div>`;
        const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        document.getElementById('subtotal-val').innerText = `Rs. ${subtotal.toLocaleString()}`;
        const fee = 150;
        document.getElementById('fee-label').innerText = 'Delivery Fee';
        document.getElementById('fee-val').innerText = `Rs. ${fee.toLocaleString()}`;
        document.getElementById('total-val').innerText = `Rs. ${(subtotal + fee).toLocaleString()}`;
        ['subtotal-val','fee-val','total-val'].forEach(id => animateElement(document.getElementById(id), 'value-feedback'));
        if (window.lucide) lucide.createIcons();
    }

    function alterQtyByIndex(index, delta) {
        if (!Number.isInteger(index) || index < 0 || index >= state.cart.length) return;
        if (!Number.isInteger(delta) || Math.abs(delta) !== 1) return;
        const currentQty = Math.max(1, Number(state.cart[index].qty) || 1);
        const nextQty = currentQty + delta;
        const itemName = state.cart[index].name;
        if (nextQty <= 0) {
            state.cart.splice(index, 1);
            triggerToast(`${itemName} removed from basket.`, 'info');
        }
        else state.cart[index].qty = Math.min(20, nextQty);
        renderCart();
    }

    document.addEventListener('click', event => {
        const button = event.target.closest('[data-cart-action][data-cart-index]');
        if (!button) return;
        const index = Number(button.dataset.cartIndex);
        const delta = button.dataset.cartAction === 'increase' ? 1 : -1;
        alterQtyByIndex(index, delta);
    });

    let orderSubmissionInProgress = false;

    function renderCheckoutPage() {
        const summary = document.getElementById('checkout-summary-items');
        if (!summary) return;
        summary.innerHTML = state.cart.map(item => `
            <div class="checkout-summary-item">
                <div><strong>${escapeHtml(item.name)} × ${Number(item.qty) || 1}</strong><small>Rs. ${Number(item.price).toLocaleString()} each</small></div>
                <strong>Rs. ${(Number(item.price) * Number(item.qty || 1)).toLocaleString()}</strong>
            </div>
        `).join('');
        const subtotal = state.cart.reduce((sum, item) => sum + Number(item.price) * Number(item.qty || 1), 0);
        document.getElementById('checkout-subtotal').textContent = `Rs. ${subtotal.toLocaleString()}`;
        document.getElementById('checkout-delivery-fee').textContent = 'Rs. 150';
        document.getElementById('checkout-total').textContent = `Rs. ${(subtotal + 150).toLocaleString()}`;
    }

    function openCheckoutPage() {
        evaluateStoreAvailability();
        if (!state.storeAcceptingOrders) {
            triggerToast(state.storeStatusReason || "The kitchen is currently closed and cannot accept orders.", "danger");
            return;
        }
        if (state.cart.length === 0) {
            triggerToast("Your cart is empty.", "danger");
            return;
        }

        const analyticsSubtotal = state.cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0);
        trackAnalyticsEvent('begin_checkout', {
            currency: 'PKR',
            value: analyticsSubtotal,
            items: state.cart.map(item => analyticsItem(item, item.qty))
        });

        document.getElementById('cart-pane-element')?.classList.add('hidden');
        const user = state.currentUser;
        document.getElementById('checkout-name').value = user?.name || '';
        document.getElementById('checkout-email').value = user?.email || '';
        document.getElementById('checkout-phone').value = user?.phone || '';
        document.getElementById('checkout-address').value = [user?.street, user?.city].filter(Boolean).join(', ');
        renderCheckoutPage();
        document.body.classList.remove('menu-page-active');
        document.body.classList.add('checkout-active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.lucide) lucide.createIcons();
    }

    function leaveCheckoutPage(openBasket = false) {
        document.body.classList.remove('checkout-active');
        switchPanel('portal');
        if (openBasket) document.getElementById('cart-pane-element')?.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function submitCheckoutPage(event) {
        event.preventDefault();
        if (orderSubmissionInProgress) return;
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const button = event.submitter || document.getElementById('checkout-submit-button');
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Placing Order…';
        try {
            if (!state.currentUser && !auth.currentUser) await signInAnonymously(auth);
            const activeUser = state.currentUser || auth.currentUser;
            const placed = await createOrder({
                userId: activeUser?.uid || '',
                customerType: state.currentUser ? 'customer' : 'guest',
                customerName: document.getElementById('checkout-name').value.trim(),
                customerEmail: document.getElementById('checkout-email').value.trim(),
                customerPhone: document.getElementById('checkout-phone').value.trim(),
                deliveryAddress: document.getElementById('checkout-address').value.trim()
            }, false);
            if (placed) document.body.classList.remove('checkout-active');
        } catch (error) {
            triggerToast(friendlyFirebaseError(error, 'Could not place the order.'), 'danger');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    async function submitGuestOrder(event) {
        event.preventDefault();
        if (state.cart.length === 0) {
            toggleGuestCheckoutModal(false);
            triggerToast("Your cart is empty.", "danger");
            return;
        }

        const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Placing Order...';

        let placed = false;
        try {
            if (!auth.currentUser) await signInAnonymously(auth);
            if (!auth.currentUser?.isAnonymous) {
                throw new Error('Please sign out of the current account before using guest checkout.');
            }
            placed = await createOrder({
                userId: auth.currentUser.uid,
                customerType: 'guest',
                customerName: document.getElementById('guest-name').value.trim(),
                customerEmail: document.getElementById('guest-email').value.trim(),
                customerPhone: document.getElementById('guest-phone').value.trim(),
                deliveryAddress: document.getElementById('guest-address').value.trim()
            }, false);
        } catch (error) {
            triggerToast(
                error?.code === 'auth/operation-not-allowed'
                    ? 'Guest tracking requires Anonymous sign-in to be enabled in Firebase Authentication.'
                    : friendlyFirebaseError(error, 'Could not start secure guest checkout.'),
                'danger'
            );
        }

        submitButton.disabled = false;
        submitButton.textContent = originalText;
        if (placed) toggleGuestCheckoutModal(false);
    }

    function buildValidatedOrderItems() {
        const validatedItems = state.cart.map(cartItem => {
            const currentItem = menuData.find(item => String(item.id) === String(cartItem.id));
            if (!currentItem || !isMenuItemAvailable(currentItem)) throw new Error(`${cartItem.name} is no longer available.`);
            const selectedVariant = cartItem.selectedVariant
                ? (currentItem.variants || []).find(variant => variant.name === cartItem.selectedVariant.name)
                : null;
            if (cartItem.selectedVariant && !selectedVariant) throw new Error(`A selected option for ${currentItem.name} is no longer available.`);
            const selectedAddons = (cartItem.selectedAddons || []).map(selected => {
                const group = (currentItem.addonGroups || []).find(item => item.name === selected.groupName);
                const option = group?.options?.find(item => item.name === selected.name);
                if (!option) throw new Error(`${selected.name} is no longer available for ${currentItem.name}.`);
                return { ...option, groupName: group.name };
            });
            const selectedMealItems = (cartItem.selectedMealItems || currentItem.mealItems || []).map((selected, index) => {
                const component = currentItem.mealItems?.[index];
                const allowedIds = component ? [component.itemId, ...(component.substituteItemIds || [])].map(String) : [];
                const selectedItem = menuData.find(item => String(item.id) === String(selected.itemId));
                if (!component || !allowedIds.includes(String(selected.itemId)) || !isBasicItemAvailable(selectedItem)) throw new Error(`A component of ${currentItem.name} is unavailable. Please choose another substitution.`);
                return { itemId: String(selectedItem.id), name: selectedItem.name, quantity: Number(component.quantity || 1) };
            });
            const unitPrice = Number(currentItem.price) + Number(selectedVariant?.priceAdjustment || 0) + selectedAddons.reduce((sum, addon) => sum + Number(addon.priceAdjustment || 0), 0);
            return {
                itemId: String(currentItem.id), name: currentItem.name, price: unitPrice, quantity: Number(cartItem.qty),
                selectedVariant, selectedAddons, selectedMealItems, instructions: String(cartItem.instructions || '').slice(0, 250)
            };
        });

        const requiredStock = new Map();
        validatedItems.forEach(item => {
            requiredStock.set(item.itemId, (requiredStock.get(item.itemId) || 0) + item.quantity);
            (item.selectedMealItems || []).forEach(component => {
                const componentQuantity = Number(component.quantity || 1) * item.quantity;
                requiredStock.set(component.itemId, (requiredStock.get(component.itemId) || 0) + componentQuantity);
            });
        });
        requiredStock.forEach((required, itemId) => {
            const currentItem = menuData.find(item => String(item.id) === String(itemId));
            const available = getStockQuantity(currentItem);
            if (available !== null && required > available) {
                throw new Error(`Only ${available} ${currentItem?.name || 'item'}${available === 1 ? ' is' : 's are'} currently available.`);
            }
        });
        return validatedItems;
    }

    async function buildFreshValidatedOrderItems() {
        let snapshot;
        try {
            snapshot = await getDocsFromServer(collection(db, "items"));
        } catch (error) {
            const checkoutError = new Error("Could not verify the latest menu details. Check your internet connection and try again.");
            checkoutError.code = error?.code || "menu-refresh-failed";
            throw checkoutError;
        }

        menuData = snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() }));
        writeCachedMenu(menuData);

        const validatedItems = buildValidatedOrderItems();
        const changedPrices = [];

        validatedItems.forEach((validatedItem, index) => {
            const cartItem = state.cart[index];
            const previousPrice = Number(cartItem.price || 0);
            const latestPrice = Number(validatedItem.price || 0);
            if (Math.abs(previousPrice - latestPrice) > 0.001) {
                changedPrices.push(`${validatedItem.name}: Rs. ${previousPrice.toLocaleString()} → Rs. ${latestPrice.toLocaleString()}`);
                cartItem.price = latestPrice;
            }
            cartItem.name = validatedItem.name;
            cartItem.selectedVariant = validatedItem.selectedVariant;
            cartItem.selectedAddons = validatedItem.selectedAddons;
            cartItem.selectedMealItems = validatedItem.selectedMealItems;
        });

        if (changedPrices.length) {
            renderCart();
            throw new Error(`The menu price changed (${changedPrices.join("; ")}). Your basket has been updated—please review it and place the order again.`);
        }

        return validatedItems;
    }

    function getLocalOrdersPlacedToday() {
        const today = new Date().toISOString().slice(0, 10);
        const stored = JSON.parse(localStorage.getItem('snack-station-daily-orders') || 'null');
        return stored?.date === today ? Math.max(0, Number(stored.count || 0)) : 0;
    }

    function rememberLocalOrderPlacedToday() {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem('snack-station-daily-orders', JSON.stringify({
            date: today,
            count: getLocalOrdersPlacedToday() + 1
        }));
    }

    function checkAdvisoryDailyOrderLimit() {
        const limit = Number(state.storeSettings.dailyOrderCapacity);
        if (!Number.isFinite(limit) || limit <= 0) return true;

        const today = new Date().toISOString().slice(0, 10);
        const visibleOrdersToday = (state.orders || []).filter(order => {
            const date = getOrderDate(order);
            return date && date.toISOString().slice(0, 10) === today && order.status !== 'cancelled';
        }).length;
        const knownCount = Math.max(visibleOrdersToday, getLocalOrdersPlacedToday());
        if (knownCount >= limit) {
            triggerToast('The kitchen has reached today’s order limit. Please try again tomorrow.', 'danger');
            return false;
        }
        return true;
    }

    function buildOrderFingerprint(customerDetails, validatedItems, fulfilmentType) {
        return JSON.stringify({
            customer: customerDetails.userId || customerDetails.customerPhone || 'guest',
            fulfilmentType,
            items: validatedItems.map(item => ({
                id: item.itemId,
                quantity: item.quantity,
                variant: item.selectedVariant?.name || '',
                addons: (item.selectedAddons || []).map(addon => addon.name).sort(),
                note: item.instructions || ''
            }))
        });
    }

    function friendlyFirebaseError(error, fallback = "The operation could not be completed.") {
        const code = String(error?.code || '');
        if (code.includes('permission-denied')) return "Firebase blocked this action. Check that you are signed in with the correct role and that the published Firestore rules match this app.";
        if (code.includes('unauthenticated')) return "Your session has expired. Please sign in again.";
        if (code.includes('unavailable') || code.includes('network')) return "The connection was interrupted. Check your internet connection and try again.";
        if (code.includes('resource-exhausted') && error?.message) return error.message;
        if (code.includes('resource-exhausted')) return "The service is temporarily busy. Please wait a moment and try again.";
        return error?.message || fallback;
    }

    async function retryOperation(operation, attempts = 2) {
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try { return await operation(); }
            catch (error) {
                lastError = error;
                const retryable = /unavailable|network|aborted|deadline-exceeded/i.test(String(error?.code || error?.message || ''));
                if (!retryable || attempt === attempts) throw error;
                await new Promise(resolve => setTimeout(resolve, 450 * attempt));
            }
        }
        throw lastError;
    }

    async function createOrder(customerDetails, closeCart = true) {
        evaluateStoreAvailability();
        if (!state.storeAcceptingOrders) {
            triggerToast(state.storeStatusReason || "The kitchen is currently closed and cannot accept orders.", "danger");
            return false;
        }
        if (orderSubmissionInProgress) return false;
        if (!checkAdvisoryDailyOrderLimit()) return false;
        let validatedItems;
        try { validatedItems = await buildFreshValidatedOrderItems(); }
        catch (error) { triggerToast(friendlyFirebaseError(error, error.message), 'danger'); return false; }
        const subtotal = validatedItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
        const fulfilmentType = 'delivery';
        const deliveryFee = 150;
        const fingerprint = buildOrderFingerprint(customerDetails, validatedItems, fulfilmentType);
        const previousSubmission = JSON.parse(localStorage.getItem('snack-station-last-order-submission') || 'null');
        if (previousSubmission?.fingerprint === fingerprint && Date.now() - Number(previousSubmission.createdAt || 0) < 90000) {
            triggerToast(`This order was already submitted${previousSubmission.orderNumber ? ` as ${previousSubmission.orderNumber}` : ''}.`, "danger");
            return false;
        }
        const orderRef = doc(collection(db, "orders"));
        const orderData = {
            orderNumber: `ORD-${Date.now().toString().slice(-8)}`,
            ...customerDetails,
            fulfilmentType,
            items: validatedItems.map(item => ({ ...item, mealItems: item.selectedMealItems })),
            subtotal,
            deliveryFee,
            total: subtotal + deliveryFee,
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        orderSubmissionInProgress = true;
        const checkoutButtons = [document.getElementById('checkout-button'), document.getElementById('checkout-submit-button'), document.querySelector('#guest-checkout-form button[type="submit"]')].filter(Boolean);
        checkoutButtons.forEach(button => {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.textContent = 'Submitting…';
        });
        try {
            await retryOperation(() => setDoc(orderRef, orderData));
            rememberLocalOrderPlacedToday();
            localStorage.setItem('snack-station-last-order-submission', JSON.stringify({
                fingerprint, createdAt: Date.now(), orderId: orderRef.id, orderNumber: orderData.orderNumber
            }));
            rememberTrackableOrder(orderRef.id, orderData);
            const analyticsItems = validatedItems.map(item => analyticsItem(item, item.quantity));
            trackAnalyticsEvent('purchase', {
                transaction_id: orderData.orderNumber,
                currency: 'PKR',
                value: orderData.total,
                shipping: orderData.deliveryFee,
                items: analyticsItems
            });
            trackAnalyticsEvent('order_placed', {
                order_type: fulfilmentType,
                customer_type: orderData.customerType,
                value: orderData.total,
                currency: 'PKR',
                item_count: validatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
            });
            state.cart = [];
            renderCart();
            if (closeCart) document.getElementById('cart-pane-element').classList.add('hidden');
            triggerToast(`Order ${orderData.orderNumber} placed successfully!`);
            showOrderTracking(orderRef.id, orderData);
            return true;
        } catch (error) {
            triggerToast(friendlyFirebaseError(error, "Could not place the order."), "danger");
            return false;
        } finally {
            orderSubmissionInProgress = false;
            checkoutButtons.forEach(button => {
                button.disabled = false;
                if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
            });
            renderStoreStatus();
        }
    }

    function showOrderTracking(orderId, initialOrder) {
        if (stopOrderTrackingListener) stopOrderTrackingListener();
        renderTrackingOrder({ id: orderId, ...initialOrder });
        switchPanel('tracking');
        stopOrderTrackingListener = onSnapshot(doc(db, "orders", orderId), snapshot => {
            if (snapshot.exists()) renderTrackingOrder({ id: snapshot.id, ...snapshot.data() });
        }, error => {
            console.warn("Live order tracking stopped:", error);
            triggerToast("Live updates are temporarily unavailable.", "danger");
        });
    }

    const TRACKABLE_ORDERS_KEY = 'snack-station-trackable-orders-v1';

    function readStoredTrackableOrders() {
        try {
            const saved = JSON.parse(localStorage.getItem(TRACKABLE_ORDERS_KEY) || '[]');
            return Array.isArray(saved) ? saved.filter(order => order?.id && order?.orderNumber) : [];
        } catch (error) {
            localStorage.removeItem(TRACKABLE_ORDERS_KEY);
            return [];
        }
    }

    function getTrackableOrders() {
        const saved = readStoredTrackableOrders();
        if (state.currentUser?.role === 'customer') {
            return saved.filter(order => order.customerType !== 'guest').slice(0, 10);
        }

        const currentGuestOrder = saved
            .filter(order => order.customerType === 'guest' && (!auth.currentUser?.uid || order.ownerUid === auth.currentUser.uid))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
        return currentGuestOrder ? [currentGuestOrder] : [];
    }

    function rememberTrackableOrder(orderId, order) {
        const trackableOrder = {
            id: orderId,
            orderNumber: order.orderNumber,
            ownerUid: order.userId || auth.currentUser?.uid || '',
            customerType: order.customerType || (auth.currentUser?.isAnonymous ? 'guest' : 'customer'),
            status: order.status || 'pending',
            createdAt: order.createdAt || new Date().toISOString()
        };
        const saved = readStoredTrackableOrders().filter(item => item.id !== orderId);
        const next = trackableOrder.customerType === 'guest'
            ? [trackableOrder, ...saved.filter(item => item.customerType !== 'guest')]
            : [trackableOrder, ...saved.filter(item => item.customerType !== 'guest')].slice(0, 10);
        localStorage.setItem(TRACKABLE_ORDERS_KEY, JSON.stringify(next));
    }

    function openOrderTracking() {
        if (stopOrderTrackingListener) {
            stopOrderTrackingListener();
            stopOrderTrackingListener = null;
        }
        switchPanel('tracking');
        renderTrackingLookup();
        const trackingContent = document.getElementById('tracking-content');
        trackingContent.innerHTML = '';
        trackingContent.style.display = 'none';
        lucide.createIcons();
    }

    function renderTrackingLookup() {
        // Order tracking now uses the reference field only.
    }

    async function trackSavedOrder(orderId) {
        const savedOrder = getTrackableOrders().find(order => order.id === orderId);
        if (!savedOrder) return triggerToast('This order is not saved on this device.', 'danger');
        document.getElementById('tracking-reference').value = savedOrder.orderNumber;
        try {
            await auth.authStateReady();
            if (!auth.currentUser) {
                await signInAnonymously(auth);
                await auth.authStateReady();
            }
            if (savedOrder.ownerUid && auth.currentUser?.uid !== savedOrder.ownerUid) {
                const message = savedOrder.customerType === 'guest'
                    ? 'This order belongs to an earlier guest session. Place a new test order in this browser, then track it without signing out or clearing browser data.'
                    : 'Sign in with the same customer account that placed this order.';
                return triggerToast(message, 'danger');
            }
            const snapshot = await getDoc(doc(db, 'orders', orderId));
            if (!snapshot.exists()) return triggerToast('Order not found.', 'danger');
            const order = { id: snapshot.id, ...snapshot.data() };
            rememberTrackableOrder(orderId, order);
            renderTrackingLookup();
            showOrderTracking(orderId, order);
        } catch (error) {
            triggerToast(friendlyFirebaseError(error, 'Could not retrieve this order.'), 'danger');
        }
    }

    function trackSavedOrderReference() {
        const reference = document.getElementById('tracking-reference').value.trim().toUpperCase();
        if (!reference) return triggerToast('Enter your order reference.', 'danger');
        const savedOrder = getTrackableOrders().find(order => String(order.orderNumber).toUpperCase() === reference);
        if (!savedOrder) return triggerToast('No matching order was found on this device.', 'danger');
        trackSavedOrder(savedOrder.id);
    }

    function renderTrackingOrder(order) {
        const container = document.getElementById('tracking-content');
        if (!container) return;
        container.style.display = 'block';

        const stages = [
            { key: 'pending', label: 'Order Received', icon: 'clipboard-check' },
            { key: 'preparing', label: 'Preparing', icon: 'cooking-pot' },
            { key: 'ready', label: 'Ready', icon: 'package-check' },
            { key: 'completed', label: 'Completed', icon: 'badge-check' }
        ];
        const normalizedStatus = order.status === 'new' ? 'pending' : order.status === 'delivery' ? 'ready' : order.status;
        const isRejected = normalizedStatus === 'rejected';
        const currentIndex = Math.max(0, stages.findIndex(stage => stage.key === normalizedStatus));
        const isAccepted = ['preparing', 'ready', 'completed'].includes(normalizedStatus);
        const currentStage = isRejected
            ? { label: 'Order Rejected', icon: 'circle-x' }
            : isAccepted && normalizedStatus === 'preparing'
                ? { ...stages[currentIndex], label: 'Order Accepted' }
                : stages[currentIndex];
        const itemRows = Array.isArray(order.items) ? order.items.map(item => `
            <div class="summary-row">
                <span>${item.quantity} × ${item.name}${item.selectedVariant?.name ? ` (${item.selectedVariant.name})` : ''}${item.selectedAddons?.length ? ` + ${item.selectedAddons.map(addon => addon.name).join(', ')}` : ''}${item.instructions ? `<small style="display:block; color:var(--warning);">Note: ${item.instructions}</small>` : ''}</span>
                <span>Rs. ${(Number(item.price) * Number(item.quantity)).toLocaleString()}</span>
            </div>
        `).join('') : '';

        container.innerHTML = `
            <div style="text-align:center;">
                <div class="tracking-animation"><i data-lucide="${currentStage.icon}" style="width:42px; height:42px;"></i></div>
                <p style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">${order.orderNumber || order.id}</p>
                <h3 style="font-size:1.7rem; margin-top:6px;">${currentStage.label}</h3>
                <p style="color:${isRejected ? 'var(--danger)' : 'var(--text-muted)'}; margin-top:6px;">${isRejected ? (order.rejectionReason || 'The kitchen could not accept this order.') : order.status === 'preparing' ? `Estimated preparation time: ${Number(order.preparationMinutes || 20)} minutes.` : 'This page updates automatically when your order status changes.'}</p>
            </div>

            <div class="tracking-steps" style="${isRejected ? 'display:none;' : ''}">
                ${stages.map((stage, index) => `
                    <div class="tracking-step ${index < currentIndex ? 'complete' : ''} ${index === currentIndex ? 'active' : ''}">
                        <div class="tracking-step-icon"><i data-lucide="${index < currentIndex ? 'check' : stage.icon}" style="width:18px;"></i></div>
                        <strong style="font-size:0.82rem;">${stage.label}</strong>
                    </div>
                `).join('')}
            </div>

            <div class="layout-grid cols-2" style="margin-top:2rem;">
                <div style="background:var(--bg-input); border-radius:var(--radius-md); padding:1.25rem;">
                    <h4 style="margin-bottom:1rem;">Delivery Details</h4>
                    <p style="font-weight:700;">${order.customerName || ''}</p>
                    <p style="color:var(--text-muted); margin-top:5px;">${order.customerPhone || ''}</p>
                    <p style="color:var(--text-muted); margin-top:5px;">${order.customerEmail || ''}</p>
                    <p style="color:var(--text-muted); margin-top:5px;">${order.deliveryAddress || ''}</p>
                </div>
                <div style="background:var(--bg-input); border-radius:var(--radius-md); padding:1.25rem;">
                    <h4 style="margin-bottom:1rem;">Order Summary</h4>
                    ${itemRows}
                    <div class="summary-row"><span>Delivery Fee</span><span>Rs. ${Number(order.deliveryFee || 0).toLocaleString()}</span></div>
                    <div class="summary-row total"><span>Total</span><span>Rs. ${Number(order.total || 0).toLocaleString()}</span></div>
                </div>
            </div>
        `;
        rememberTrackableOrder(order.id, order);
        renderTrackingLookup();
        lucide.createIcons();
    }

    function stopTrackingAndReturn() {
        if (stopOrderTrackingListener) {
            stopOrderTrackingListener();
            stopOrderTrackingListener = null;
        }
        switchPanel('portal');
    }

    function logOut() {
        state.currentUser = null;
        cachedAuthUser = null;
        writeCachedAuthUser(null);
        if (stopOrderTrackingListener) {
            stopOrderTrackingListener();
            stopOrderTrackingListener = null;
        }
        if (stopKitchenOrdersListener) {
            stopKitchenOrdersListener();
            stopKitchenOrdersListener = null;
            kitchenListenerInitialized = false;
        }
        switchPanel('portal');
        renderAuthBar();
        renderNavigation();
        renderMenu();
        signOut(auth);
        toggleSettingsModal(false);
    }

    async function loadMenuItems() {
        try {
            const snapshot = await getDocs(collection(db, "items"));
            if (!snapshot.empty) {
                menuData = snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() }));
                writeCachedMenu(menuData);
            } else {
                menuData = [];
                localStorage.removeItem(MENU_CACHE_KEY);
            }
            isMenuLoading = false;
            state.categories = [...new Set([...state.categories, ...menuData.map(item => item.category).filter(Boolean)])];
            applyMenuSorting();
            renderAdminMenuTable();
            renderCategoryManager();
        } catch (error) {
            console.warn("Could not load Firestore items:", error);
            isMenuLoading = false;
            applyMenuSorting();
            renderAdminMenuTable();
            renderCategoryManager();
        }
    }

    async function loadOrders() {
        if (!state.currentUser || (!hasAdminAccess() && !hasOrderManagerAccess())) return;
        if (stopKitchenOrdersListener) {
            renderOrdersTable();
            return;
        }
        stopKitchenOrdersListener = onSnapshot(collection(db, "orders"), snapshot => {
            const previousIds = new Set(state.orders.map(order => order.id));
            let incomingOrders = snapshot.docs
                .map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() }))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            const hasNewOrder = kitchenListenerInitialized && incomingOrders.some(order => !previousIds.has(order.id) && ['pending', 'new'].includes(order.status || 'pending'));
            newestKitchenOrderId = hasNewOrder
                ? incomingOrders.find(order => !previousIds.has(order.id) && ['pending', 'new'].includes(order.status || 'pending'))?.id
                : null;
            state.orders = incomingOrders;
            renderOrdersTable();
            if (hasNewOrder) {
                playNewOrderSound();
                triggerToast("New kitchen order received!");
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('New Snack Station order', { body:'A pending order is waiting for review.', tag:'snack-station-new-order' });
                }
            }
            kitchenListenerInitialized = true;
        }, error => {
            triggerToast(error.message || "Could not load live orders.", "danger");
        });
    }

    async function loadUsers() {
        if (!hasAdminAccess()) return;
        try {
            const snapshot = await getDocs(collection(db, "users"));
            state.users = snapshot.docs
                .map(userDoc => ({ id: userDoc.id, uid: userDoc.id, ...userDoc.data() }))
                .filter(user => hasSuperAdminAccess() || user.role !== 'super_admin')
                .sort((a, b) => String(b.createdAt || b.joined || '').localeCompare(String(a.createdAt || a.joined || '')));
            renderUsersTable();
        } catch (error) {
            state.users = [];
            renderUsersTable();
            triggerToast(error.message || "Could not load users.", "danger");
        }
    }

    function renderUsersTable() {
        const tableBody = document.getElementById('users-table-body');
        if (!tableBody) return;
        const searchInput = document.getElementById('user-search-input');
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();
        const usersVisibleToCurrentRole = hasSuperAdminAccess()
            ? state.users
            : state.users.filter(user => user.role !== 'super_admin');
        const filteredUsers = usersVisibleToCurrentRole.filter(user => {
            const userRole = user.role || 'customer';
            const matchesRole = state.userRoleFilter === 'all' || userRole === state.userRoleFilter;
            const matchesSearch = String(user.name || '').toLowerCase().includes(searchTerm) ||
                String(user.email || '').toLowerCase().includes(searchTerm);
            return matchesRole && matchesSearch;
        });

        const roleCounts = {
            all: usersVisibleToCurrentRole.length,
            customer: usersVisibleToCurrentRole.filter(user => (user.role || 'customer') === 'customer').length,
            order_manager: usersVisibleToCurrentRole.filter(user => user.role === 'order_manager').length,
            admin: usersVisibleToCurrentRole.filter(user => user.role === 'admin').length,
            super_admin: hasSuperAdminAccess() ? state.users.filter(user => user.role === 'super_admin').length : 0
        };
        Object.entries(roleCounts).forEach(([role, count]) => {
            const countElement = document.getElementById(`count-role-${role}`);
            if (countElement) countElement.textContent = `(${count})`;
        });
        document.querySelectorAll('.user-role-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.role === state.userRoleFilter);
        });
        updateStaffOverview();

        tableBody.innerHTML = filteredUsers.length ? filteredUsers.map(user => {
            const roleLabels = {
                customer: 'Customer',
                order_manager: 'Order Manager',
                admin: 'Admin',
                super_admin: 'Super Admin'
            };
            const joinedDate = user.joined || (user.createdAt ? String(user.createdAt).slice(0, 10) : '—');
            const initial = String(user.name || user.email || '?')[0].toUpperCase();
            return `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="user-avatar">${initial}</div>
                            <div>
                                <strong>${user.name || 'Unnamed User'}</strong>
                                <p style="font-size:0.72rem; color:var(--text-muted); margin-top:3px;">${user.phone || 'No mobile number'}</p>
                            </div>
                        </div>
                    </td>
                    <td>${user.email || '—'}</td>
                    <td>${joinedDate}</td>
                    <td>${Number(user.orderCount || 0)}</td>
                    <td><span class="badge-status ${user.role === 'super_admin' ? 'pending' : user.role === 'admin' ? 'delivery' : user.role === 'order_manager' ? 'preparing' : 'completed'}">${roleLabels[user.role] || 'Customer'}</span></td>
                    <td style="text-align:center;">
                        ${canManageUserProfile(user) ? `
                            <button class="btn-action-edit" style="margin:0 auto;" onclick='openAdminUserEditor(${JSON.stringify(user.id)})'>
                                <i data-lucide="user-cog" style="width:14px;"></i> Manage
                            </button>
                        ` : `<span style="font-size:.72rem; color:var(--text-muted);"><i data-lucide="lock" style="width:13px; vertical-align:middle;"></i> Protected</span>`}
                    </td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:3rem;">${searchTerm ? 'No matching users found.' : 'No users found.'}</td></tr>`;
        lucide.createIcons();
    }

    function setUserRoleFilter(role) {
        state.userRoleFilter = role;
        renderUsersTable();
    }

    function openAdminUserEditor(userId) {
        const user = state.users.find(profile => profile.id === userId);
        if (!user) return;
        if (!canManageUserProfile(user)) {
            triggerToast("Only the super-admin can edit administrator accounts.", "danger");
            return;
        }
        document.getElementById('edit-profile-user-id').value = user.id;
        document.getElementById('edit-profile-name').value = user.name || '';
        document.getElementById('edit-profile-email').value = user.email || '';
        document.getElementById('edit-profile-phone').value = user.phone || '';
        const supportedCities = ['Lahore', 'Islamabad', 'Peshawar'];
        const savedCity = supportedCities.find(city => city.toLowerCase() === String(user.city || '').toLowerCase());
        document.getElementById('edit-profile-city').value = savedCity || 'Lahore';
        document.getElementById('edit-profile-street').value = user.street || '';
        const roleSelect = document.getElementById('edit-profile-role');
        const superAdminOption = document.getElementById('super-admin-role-option');
        if (superAdminOption) superAdminOption.disabled = user.role !== 'super_admin';
        roleSelect.value = user.role || 'customer';
        document.getElementById('edit-profile-role-group').style.display = hasSuperAdminAccess() ? 'block' : 'none';
        toggleAdminUserModal(true);
    }

    async function handleAdminUserUpdate(event) {
        event.preventDefault();
        if (!hasAdminAccess()) return;
        const userId = document.getElementById('edit-profile-user-id').value;
        const existingUser = state.users.find(profile => profile.id === userId);
        if (!existingUser) return;
        if (!canManageUserProfile(existingUser)) {
            triggerToast("Only the super-admin can edit administrator accounts.", "danger");
            toggleAdminUserModal(false);
            return;
        }
        const previousRole = existingUser.role || 'customer';
        const requestedRole = document.getElementById('edit-profile-role').value;
        const nextRole = hasSuperAdminAccess() ? requestedRole : previousRole;

        if (nextRole === 'super_admin' && previousRole !== 'super_admin') {
            triggerToast("Only one super-admin is allowed. Assign the Admin role instead.", "danger");
            return;
        }

        if (userId === state.currentUser.uid && previousRole === 'super_admin' && nextRole !== 'super_admin') {
            triggerToast("You cannot remove your own super-admin access.", "danger");
            return;
        }

        const updates = {
            name: document.getElementById('edit-profile-name').value.trim(),
            phone: document.getElementById('edit-profile-phone').value.trim(),
            city: document.getElementById('edit-profile-city').value.trim(),
            street: document.getElementById('edit-profile-street').value.trim(),
            role: nextRole,
            updatedAt: new Date().toISOString()
        };
        const profileChanges = {};
        const profileFields = { name: 'Name', phone: 'Phone', city: 'City', street: 'Address' };
        Object.entries(profileFields).forEach(([field, label]) => {
            if (!valuesEqual(existingUser[field] || '', updates[field] || '')) {
                profileChanges[label] = { from: existingUser[field] || '', to: updates[field] || '' };
            }
        });
        try {
            await setDoc(doc(db, "users", userId), updates, { merge: true });
            if (Object.keys(profileChanges).length) {
                await writeAuditLog('user.profile_update', {
                    userId,
                    userName: existingUser.name || existingUser.email || userId,
                    changes: profileChanges
                });
            }
            if (previousRole !== nextRole) {
                await writeAuditLog('user.role_change', {
                    userId,
                    userName: existingUser.name || existingUser.email || userId,
                    changes: { Role: { from: previousRole, to: nextRole } }
                });
            }
            toggleAdminUserModal(false);
            await loadUsers();
            triggerToast("User profile updated!");
        } catch (error) {
            triggerToast(error.message || "Could not update the user.", "danger");
        }
    }

    async function sendManagedUserPasswordReset() {
        if (!hasAdminAccess()) return;
        const userId = document.getElementById('edit-profile-user-id').value;
        const managedUser = state.users.find(profile => profile.id === userId);
        if (!canManageUserProfile(managedUser)) {
            triggerToast("Only the super-admin can manage administrator accounts.", "danger");
            return;
        }
        const email = String(managedUser.email || '').trim();
        if (!email) {
            triggerToast("This user does not have an email address.", "danger");
            return;
        }
        if (!confirm(`Send a password reset email to ${email}?`)) return;

        try {
            await sendPasswordResetEmail(auth, email);
            await writeAuditLog('user.password_reset_request', {
                userId,
                userName: managedUser.name || email,
                email
            });
            triggerToast(`Password reset email sent to ${email}.`);
        } catch (error) {
            const friendlyErrors = {
                'auth/invalid-email': 'The user email address is invalid.',
                'auth/user-not-found': 'No Firebase Authentication account was found for this email.',
                'auth/too-many-requests': 'Too many requests. Please wait and try again.'
            };
            triggerToast(friendlyErrors[error.code] || error.message || "Could not send the reset email.", "danger");
        }
    }

    function handleOrderReportFilterChange(value) {
        const toolbarFilter = document.getElementById('report-status-filter');
        const historyFilter = document.getElementById('history-status-filter');
        const selected = value || toolbarFilter?.value || historyFilter?.value || 'all';
        if (toolbarFilter) toolbarFilter.value = selected;
        if (historyFilter) historyFilter.value = selected;
        state.orderReportPage = 1;
        renderOrdersTable();
    }

    function changeOrderReportPage(page) {
        state.orderReportPage = Math.max(1, Number(page) || 1);
        renderOrdersTable();
        document.getElementById('order-history-card')?.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function orderMatchesReportStatus(order, filter) {
        const status = String(order.status || 'pending').toLowerCase();
        if (filter === 'all') return true;
        if (filter === 'in_progress') return ['new', 'pending', 'accepted', 'preparing', 'ready', 'delivery'].includes(status);
        return status === filter;
    }

    function getOrderReportDetails(order) {
        const status = String(order.status || 'pending').toLowerCase();
        if (status === 'rejected') return order.rejectionReason || 'No reason provided';
        if (status === 'completed') return 'Completed';
        if (status === 'ready' || status === 'delivery') return 'Ready for collection or delivery';
        if (status === 'preparing' || status === 'accepted') return order.preparationMinutes
            ? `Preparing · ${order.preparationMinutes} min estimate`
            : 'Preparing';
        return 'Waiting for acceptance';
    }

    function renderOrdersTable() {
        const board = document.getElementById('kitchen-board');
        if (!board) return;
        const orderManagerView = hasOrderManagerAccess();
        const fromValue = document.getElementById('report-date-from')?.value;
        const toValue = document.getElementById('report-date-to')?.value;
        const statusValue = document.getElementById('report-status-filter')?.value || 'all';
        const historyStatusFilter = document.getElementById('history-status-filter');
        if (historyStatusFilter && historyStatusFilter.value !== statusValue) historyStatusFilter.value = statusValue;
        const filteredForReport = state.orders.filter(order => {
            const date = getOrderDate(order);
            return (!fromValue || (date && date >= new Date(`${fromValue}T00:00:00`)))
                && (!toValue || (date && date <= new Date(`${toValue}T23:59:59`)))
                && orderMatchesReportStatus(order, statusValue);
        });
        const visibleOrders = orderManagerView ? filteredForReport.filter(isOrderFromToday) : filteredForReport;
        const managerDashboard = document.getElementById('order-manager-dashboard');
        if (managerDashboard) managerDashboard.style.display = orderManagerView ? 'block' : 'none';
        const revenueCard = document.getElementById('revenue-stat-card');
        const statsGrid = document.getElementById('order-stats-grid');
        if (statsGrid) statsGrid.style.display = orderManagerView ? 'none' : 'grid';
        if (revenueCard) revenueCard.style.display = orderManagerView ? 'none' : 'flex';
        if (statsGrid) {
            statsGrid.classList.toggle('cols-2', orderManagerView);
            statsGrid.classList.toggle('cols-3', !orderManagerView);
        }
        const historyTitle = document.getElementById('order-history-title');
        if (historyTitle) historyTitle.textContent = orderManagerView ? "Today's Order Report" : 'Order Report';
        if (orderManagerView) {
            const uid = state.currentUser?.uid;
            const countStatus = statuses => visibleOrders.filter(order => statuses.includes(order.status || 'pending')).length;
            const acceptedByMe = state.orders.filter(order => order.acceptedById === uid).length;
            const rejectedByMe = state.orders.filter(order => order.rejectedById === uid).length;
            const completedByMe = state.orders.filter(order => order.completedById === uid).length;
            const decisions = acceptedByMe + rejectedByMe;
            const managerStats = {
                'manager-today-new': countStatus(['pending', 'new']),
                'manager-today-preparing': countStatus(['preparing']),
                'manager-today-ready': countStatus(['ready', 'delivery']),
                'manager-today-completed': countStatus(['completed']),
                'manager-today-rejected': countStatus(['rejected']),
                'manager-total-accepted': acceptedByMe,
                'manager-total-rejected': rejectedByMe,
                'manager-total-completed': completedByMe,
                'manager-acceptance-rate': decisions ? `${Math.round((acceptedByMe / decisions) * 100)}%` : '0%'
            };
            Object.entries(managerStats).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
            const dateLabel = document.getElementById('manager-dashboard-date');
            if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString([], { weekday:'long', day:'numeric', month:'long', year:'numeric' });
        }
        const columns = [
            { key: 'new', title: 'New Orders', icon: 'bell-ring', statuses: ['pending', 'new'] },
            { key: 'preparing', title: 'Preparing', icon: 'cooking-pot', statuses: ['preparing'] },
            { key: 'ready', title: 'Ready', icon: 'package-check', statuses: ['ready', 'delivery'] }
        ];
        board.innerHTML = columns.map(column => {
            const orders = visibleOrders.filter(order => column.statuses.includes(order.status || 'pending'));
            return `
                <section class="kitchen-column">
                    <div class="kitchen-column-header">
                        <h3 style="display:flex; align-items:center; gap:7px;"><i data-lucide="${column.icon}" style="width:18px; color:var(--accent);"></i>${column.title}</h3>
                        <span>${orders.length}</span>
                    </div>
                    <div>${orders.length ? orders.map(order => renderKitchenOrderCard(order, column.key)).join('') : `<div class="empty-kitchen-column">No ${column.title.toLowerCase()}</div>`}</div>
                </section>
            `;
        }).join('');

        const historyList = document.getElementById('order-history-list');
        const pagination = document.getElementById('order-report-pagination');
        const historyOrders = [...visibleOrders].sort((a, b) =>
            (getOrderDate(b)?.getTime() || 0) - (getOrderDate(a)?.getTime() || 0)
        );
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(historyOrders.length / pageSize));
        state.orderReportPage = Math.min(Math.max(1, state.orderReportPage || 1), totalPages);
        const pageStart = (state.orderReportPage - 1) * pageSize;
        const pageOrders = historyOrders.slice(pageStart, pageStart + pageSize);
        if (historyList) {
            historyList.innerHTML = pageOrders.length ? `<table><thead><tr><th>Order</th><th>Date & Time</th><th>Customer</th><th>Total</th><th>Status</th><th>Details</th></tr></thead><tbody>${pageOrders.map(order => {
                const date = getOrderDate(order);
                const status = String(order.status || 'pending').toLowerCase();
                return `<tr>
                    <td><strong>${escapeHtml(order.orderNumber || order.id)}</strong></td>
                    <td class="order-date-cell"><strong>${date ? escapeHtml(date.toLocaleDateString([], { day:'2-digit', month:'short', year:'numeric' })) : 'Date unavailable'}</strong><small>${date ? escapeHtml(date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })) : '—'}</small></td>
                    <td>${escapeHtml(order.customerName || 'Guest')}</td>
                    <td>Rs. ${Number(order.total || 0).toLocaleString()}</td>
                    <td><span class="badge-status ${escapeHtml(status)}">${escapeHtml(status.replace('_', ' '))}</span></td>
                    <td>${escapeHtml(getOrderReportDetails(order))}</td>
                </tr>`;
            }).join('')}</tbody></table>` : '<div style="padding:24px; text-align:center; color:var(--text-muted);">No orders match the selected filters.</div>';
        }
        if (pagination) {
            const firstRecord = historyOrders.length ? pageStart + 1 : 0;
            const lastRecord = Math.min(pageStart + pageSize, historyOrders.length);
            pagination.innerHTML = `
                <span class="report-page-summary">Showing ${firstRecord}–${lastRecord} of ${historyOrders.length} records</span>
                <div class="report-page-actions">
                    <button type="button" onclick="changeOrderReportPage(${state.orderReportPage - 1})" ${state.orderReportPage === 1 ? 'disabled' : ''} aria-label="Previous page"><i data-lucide="chevron-left"></i></button>
                    <span class="report-page-number">Page ${state.orderReportPage} of ${totalPages}</span>
                    <button type="button" onclick="changeOrderReportPage(${state.orderReportPage + 1})" ${state.orderReportPage === totalPages ? 'disabled' : ''} aria-label="Next page"><i data-lucide="chevron-right"></i></button>
                </div>`;
        }

        const completedOrders = visibleOrders.filter(order => order.status === 'completed');
        const revenue = completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const revenueStat = document.getElementById('stat-revenue');
        if (revenueStat) revenueStat.textContent = `Rs. ${revenue.toLocaleString()}`;
        document.getElementById('stat-completed-count').textContent = completedOrders.length;
        document.getElementById('stat-active-count').textContent = visibleOrders.filter(order => !['completed', 'rejected'].includes(order.status)).length;
        updateStaffOverview();
        renderOrderAnalytics(visibleOrders);
        lucide.createIcons();
    }

    function renderKitchenOrderCard(order, columnKey) {
        const orderNumber = order.orderNumber || order.id;
        const createdTime = order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const waitMinutes = Math.max(0, Math.floor((Date.now() - (getOrderDate(order)?.getTime() || Date.now())) / 60000));
        const overdue = columnKey === 'new' && waitMinutes >= 10;
        const items = Array.isArray(order.items) ? order.items.map(item => `
            <div>
                <strong>${Number(item.quantity || 1)} × ${item.name}</strong>
                ${item.selectedVariant?.name ? `<div style="color:var(--text-muted); font-size:.72rem;">${item.selectedVariant.name}</div>` : ''}
                ${item.selectedAddons?.length ? `<div style="color:var(--text-muted); font-size:.72rem;">+ ${item.selectedAddons.map(addon => addon.name).join(', ')}</div>` : ''}
                ${item.instructions ? `<div class="kitchen-item-note">Note: ${item.instructions}</div>` : ''}
            </div>
        `).join('') : '<div>No item details</div>';
        const actions = columnKey === 'new' ? `
            <div class="prep-time-control"><label for="prep-${order.id}" style="font-size:.72rem; color:var(--text-muted);">Prep time</label><input id="prep-${order.id}" type="number" min="5" max="180" step="5" value="${Number(order.preparationMinutes || 20)}"><span style="font-size:.72rem;">minutes</span></div>
            <div class="kitchen-card-actions">
                <button class="btn-primary" onclick='acceptOrder(${JSON.stringify(order.id)})'><i data-lucide="check" style="width:14px;"></i> Accept</button>
                <button class="btn-danger" onclick='rejectOrder(${JSON.stringify(order.id)})'><i data-lucide="x" style="width:14px;"></i> Reject</button>
            </div>
        ` : columnKey === 'preparing' ? `
            <p style="font-size:.75rem; color:var(--info); margin-top:8px;"><strong>Estimate:</strong> ${Number(order.preparationMinutes || 20)} minutes</p>
            <div class="kitchen-card-actions"><button class="btn-primary" onclick='markOrderReady(${JSON.stringify(order.id)})'><i data-lucide="package-check" style="width:14px;"></i> Mark Ready</button></div>
        ` : `
            <div class="kitchen-card-actions"><button class="btn-primary" onclick='completeKitchenOrder(${JSON.stringify(order.id)})'><i data-lucide="badge-check" style="width:14px;"></i> Complete Order</button></div>
        `;
        return `
            <article class="kitchen-card ${overdue ? 'overdue' : ''} ${order.id === newestKitchenOrderId ? 'new-arrival' : ''}">
                <div class="kitchen-card-head"><div><strong>${orderNumber}</strong><p style="font-size:.7rem; color:var(--text-muted); margin-top:3px;">${order.customerName || 'Guest'} · ${createdTime}</p><span class="wait-chip ${overdue ? 'overdue' : ''}">${overdue ? 'Needs attention · ' : ''}${waitMinutes} min waiting</span></div><strong>Rs. ${Number(order.total || 0).toLocaleString()}</strong></div>
                <div class="kitchen-card-items">${items}</div>
                <p style="font-size:.72rem; color:var(--text-muted);">${order.customerPhone || ''}${order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}</p>
                ${actions}
            </article>
        `;
    }

    async function updateOrderStatus(orderId, newStatus, extraUpdates = {}) {
        if (!state.currentUser || (!hasAdminAccess() && !hasOrderManagerAccess())) {
            triggerToast("Order management access is required.", "danger");
            return;
        }
        const existingOrder = state.orders.find(item => item.id === orderId);
        const previousStatus = existingOrder?.status || 'pending';
        try {
            await setDoc(doc(db, "orders", orderId), {
                status: newStatus,
                ...extraUpdates,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            if (existingOrder) Object.assign(existingOrder, { status: newStatus, ...extraUpdates });
            await writeAuditLog('order.status_change', { orderId, changes: { Status: { from: previousStatus, to: newStatus } }, ...extraUpdates });
            trackAnalyticsEvent('order_status_changed', {
                previous_status: previousStatus,
                new_status: newStatus,
                staff_role: state.currentUser.role
            });
            renderOrdersTable();
            triggerToast("Order status updated!");
        } catch (error) {
            triggerToast(error.message || "Could not update the order.", "danger");
            await loadOrders();
        }
    }

    function renderAdminMenuTable(refreshIcons = true) {
        const tableBody = document.getElementById('admin-menu-table-body');
        if (!tableBody) return;
        const query = state.adminMenuSearch.toLowerCase();
        const filteredItems = menuData.filter(item => {
            const matchesSearch = !query || `${item.name} ${item.desc || ''} ${item.category || ''}`.toLowerCase().includes(query);
            const matchesCategory = state.adminMenuCategoryFilter === 'all' || item.category === state.adminMenuCategoryFilter;
            const matchesStatus = state.adminMenuStatusFilter === 'all' ||
                (state.adminMenuStatusFilter === 'hidden' && item.isVisible === false) ||
                (state.adminMenuStatusFilter === 'soldout' && item.isVisible !== false && item.isSoldOut) ||
                (state.adminMenuStatusFilter === 'active' && item.isVisible !== false && !item.isSoldOut);
            return matchesSearch && matchesCategory && matchesStatus;
        });
        const categoryFilter = document.getElementById('admin-category-filter');
        if (categoryFilter) {
            const selected = state.adminMenuCategoryFilter;
            categoryFilter.innerHTML = '<option value="all">All categories</option>' + state.categories.map(category => `<option value="${category}">${category}</option>`).join('');
            categoryFilter.value = selected;
        }

        tableBody.innerHTML = filteredItems.length ? filteredItems.map(item => `
            <tr draggable="true" data-item-id="${item.id}" ondragstart="startItemDrag(event)" ondragover="event.preventDefault()" ondrop="dropItemBefore(event)">
                <td>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${item.img}" alt="${item.name}" style="width:48px; height:48px; object-fit:cover; border-radius:10px;">
                        <div>
                            <strong><span class="drag-handle" aria-hidden="true">⋮⋮</span> ${item.name}</strong>
                            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;">${item.desc}</p>
                        </div>
                    </div>
                </td>
                <td>${item.category}</td>
                <td>Rs. ${Number(item.price).toLocaleString()}</td>
                <td style="text-align:center;">
                    ${getStockQuantity(item) === null
                        ? '<span class="stock-count">Unlimited stock</span>'
                        : `<strong>${getStockQuantity(item)}</strong><span class="stock-count">${getStockQuantity(item) === 0 ? 'Automatically sold out' : getStockQuantity(item) <= Number(item.lowStockThreshold ?? 5) ? 'Low stock' : 'units available'}</span>`}
                    <button type="button" class="${item.isSoldOut ? 'btn-danger' : 'btn-secondary'}" style="padding:7px 10px; min-width:96px; margin:auto; justify-content:center;" onclick='toggleMenuItemSoldOut(${JSON.stringify(String(item.id))})'>
                        <i data-lucide="${item.isSoldOut ? 'circle-x' : 'circle-check'}" style="width:14px;"></i>
                        ${item.isSoldOut ? 'Sold Out' : 'In Stock'}
                    </button>
                </td>
                <td style="text-align:center;">
                    <button type="button" class="${item.isVisible === false ? 'btn-secondary' : 'btn-primary'}" style="padding:7px 10px; min-width:92px; margin:auto;" onclick='toggleMenuItemVisibility(${JSON.stringify(String(item.id))})' title="${item.isVisible === false ? 'Show this item to customers' : 'Hide this item from customers'}">
                        <i data-lucide="${item.isVisible === false ? 'eye-off' : 'eye'}" style="width:14px;"></i>
                        ${item.isVisible === false ? 'Hidden' : 'Active'}
                    </button>
                </td>
                <td>
                    <div style="display:flex; justify-content:center; gap:8px;">
                        <button class="btn-action-edit" onclick='editMenuItem(${JSON.stringify(String(item.id))})'>
                            <i data-lucide="pencil" style="width:14px;"></i> Edit
                        </button>
                        <button class="btn-secondary" onclick='duplicateMenuItem(${JSON.stringify(String(item.id))})' title="Duplicate item"><i data-lucide="copy" style="width:14px;"></i></button>
                        <button class="btn-danger" onclick='removeMenuItem(${JSON.stringify(String(item.id))})'>
                            <i data-lucide="trash-2" style="width:14px;"></i> Remove
                        </button>
                    </div>
                </td>
            </tr>
        `).join('') : `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No menu items match the selected filters.</td></tr>`;
        if (refreshIcons) lucide.createIcons();
    }

    function setAdminMenuSearch(value) {
        state.adminMenuSearch = value.trim();
        renderAdminMenuTable();
    }

    function setAdminMenuFilter(type, value) {
        if (type === 'category') state.adminMenuCategoryFilter = value;
        if (type === 'status') state.adminMenuStatusFilter = value;
        renderAdminMenuTable();
    }

    function openNewItemModal() {
        resetFormState();
        document.getElementById('item-editor-modal').classList.add('active');
        document.getElementById('item-editor-modal-body').scrollTop = 0;
        lucide.createIcons();
    }

    function closeItemEditorModal() {
        document.getElementById('item-editor-modal').classList.remove('active');
        resetFormState();
    }

    function toggleCategoryManagerModal(show) {
        document.getElementById('category-manager-modal').classList.toggle('active', show);
        if (show) {
            renderCategoryManager();
            setTimeout(() => document.getElementById('new-category-name')?.focus(), 50);
        }
        lucide.createIcons();
    }

    async function toggleMenuItemSoldOut(itemId) {
        if (!hasAdminAccess()) {
            triggerToast("Admin access is required.", "danger");
            return;
        }
        const item = menuData.find(menuItem => String(menuItem.id) === String(itemId));
        if (!item) return;
        const previousValue = Boolean(item.isSoldOut);
        item.isSoldOut = !previousValue;
        renderAdminMenuTable();
        renderMenu();
        try {
            await setDoc(doc(db, "items", String(itemId)), { isSoldOut: item.isSoldOut, updatedAt: new Date().toISOString() }, { merge: true });
            await writeAuditLog('item.sold_out_change', { itemId: String(itemId), itemName: item.name, changes: { Stock: { from: previousValue ? 'Sold Out' : 'In Stock', to: item.isSoldOut ? 'Sold Out' : 'In Stock' } } });
            writeCachedMenu(menuData);
            triggerToast(item.isSoldOut ? `“${item.name}” marked Sold Out.` : `“${item.name}” is back in stock.`);
        } catch (error) {
            item.isSoldOut = previousValue;
            renderAdminMenuTable();
            renderMenu();
            triggerToast(error.message || "Could not update stock status.", "danger");
        }
    }

    function acceptOrder(orderId) {
        const preparationMinutes = Math.max(5, Math.min(180, Number(document.getElementById(`prep-${orderId}`)?.value || 20)));
        updateOrderStatus(orderId, 'preparing', {
            preparationMinutes,
            acceptedAt: new Date().toISOString(),
            acceptedById: state.currentUser?.uid || null,
            acceptedByName: state.currentUser?.name || state.currentUser?.email || 'Unknown',
            estimatedReadyAt: new Date(Date.now() + preparationMinutes * 60000).toISOString()
        });
    }

    function rejectOrder(orderId) {
        const reason = prompt('Reason for rejecting this order:', 'Item unavailable');
        if (reason === null) return;
        updateOrderStatus(orderId, 'rejected', {
            rejectionReason: reason.trim() || 'Unable to fulfil the order',
            rejectedAt: new Date().toISOString(),
            rejectedById: state.currentUser?.uid || null,
            rejectedByName: state.currentUser?.name || state.currentUser?.email || 'Unknown'
        });
    }

    function markOrderReady(orderId) {
        updateOrderStatus(orderId, 'ready', { readyAt: new Date().toISOString() });
    }

    function completeKitchenOrder(orderId) {
        updateOrderStatus(orderId, 'completed', {
            completedAt: new Date().toISOString(),
            completedById: state.currentUser?.uid || null,
            completedByName: state.currentUser?.name || state.currentUser?.email || 'Unknown'
        });
    }

    function playNewOrderSound() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const context = new AudioContextClass();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, context.currentTime);
            gain.gain.setValueAtTime(0.001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.58);
            oscillator.onended = () => context.close();
        } catch (error) {
            console.warn('New-order sound could not play:', error);
        }
    }

    const WEEKDAYS = [
        { key:'sunday', label:'Sunday' }, { key:'monday', label:'Monday' },
        { key:'tuesday', label:'Tuesday' }, { key:'wednesday', label:'Wednesday' },
        { key:'thursday', label:'Thursday' }, { key:'friday', label:'Friday' },
        { key:'saturday', label:'Saturday' }
    ];

    function defaultHoursFor(dayKey) {
        return { enabled: !['sunday'].includes(dayKey), open:'09:00', close:'22:00' };
    }

    function renderWeekdayHours() {
        const container = document.getElementById('weekday-hours');
        if (!container) return;
        container.innerHTML = WEEKDAYS.map(day => {
            const hours = state.storeSettings.weeklyHours?.[day.key] || defaultHoursFor(day.key);
            return `<div class="weekday-row">
                <label><input type="checkbox" id="hours-${day.key}-enabled" ${hours.enabled ? 'checked' : ''}> ${day.label}</label>
                <div class="weekday-time">
                    <input type="time" id="hours-${day.key}-open" value="${escapeHtml(hours.open || '09:00')}" aria-label="${day.label} opening time">
                    <input type="time" id="hours-${day.key}-close" value="${escapeHtml(hours.close || '22:00')}" aria-label="${day.label} closing time">
                </div>
            </div>`;
        }).join('');
        const temporaryToggle = document.getElementById('temporary-closure-toggle');
        const closureMessage = document.getElementById('closure-message');
        const capacity = document.getElementById('daily-order-capacity');
        if (temporaryToggle) temporaryToggle.checked = Boolean(state.storeSettings.temporaryClosed);
        if (closureMessage) closureMessage.value = state.storeSettings.closureMessage || '';
        if (capacity) capacity.value = state.storeSettings.dailyOrderCapacity ?? '';
    }

    function evaluateStoreAvailability(now = new Date()) {
        const settings = state.storeSettings || {};
        let accepting = settings.isOpen !== false;
        let reason = '';
        if (!accepting) reason = 'Ordering is currently paused by the kitchen.';
        if (accepting && settings.temporaryClosed) {
            accepting = false;
            reason = settings.closureMessage || 'The kitchen is temporarily closed.';
        }
        if (accepting) {
            const day = WEEKDAYS[now.getDay()];
            const hours = settings.weeklyHours?.[day.key];
            if (hours) {
                if (!hours.enabled) {
                    accepting = false;
                    reason = `Ordering is closed on ${day.label}.`;
                } else {
                    const minutesNow = now.getHours() * 60 + now.getMinutes();
                    const toMinutes = value => {
                        const [hour, minute] = String(value || '00:00').split(':').map(Number);
                        return hour * 60 + minute;
                    };
                    const opens = toMinutes(hours.open);
                    const closes = toMinutes(hours.close);
                    const withinHours = closes > opens
                        ? minutesNow >= opens && minutesNow < closes
                        : minutesNow >= opens || minutesNow < closes;
                    if (!withinHours) {
                        accepting = false;
                        reason = `Ordering hours today are ${hours.open}–${hours.close}.`;
                    }
                }
            }
        }
        state.storeOpen = settings.isOpen !== false;
        state.storeAcceptingOrders = accepting;
        state.storeStatusReason = reason;
        return accepting;
    }

    async function saveStoreSchedule() {
        if (!hasAdminAccess()) return triggerToast('Admin access is required.', 'danger');
        const weeklyHours = Object.fromEntries(WEEKDAYS.map(day => [day.key, {
            enabled: Boolean(document.getElementById(`hours-${day.key}-enabled`)?.checked),
            open: document.getElementById(`hours-${day.key}-open`)?.value || '09:00',
            close: document.getElementById(`hours-${day.key}-close`)?.value || '22:00'
        }]));
        const updatedSettings = {
            ...state.storeSettings,
            isOpen: state.storeOpen,
            temporaryClosed: Boolean(document.getElementById('temporary-closure-toggle')?.checked),
            closureMessage: document.getElementById('closure-message')?.value.trim() || '',
            dailyOrderCapacity: document.getElementById('daily-order-capacity')?.value === ''
                ? null
                : Math.max(0, Math.floor(Number(document.getElementById('daily-order-capacity').value))),
            weeklyHours,
            updatedAt: new Date().toISOString()
        };
        try {
            await retryOperation(() => setDoc(doc(db, 'settings', 'store'), updatedSettings, { merge:true }));
            state.storeSettings = updatedSettings;
            evaluateStoreAvailability();
            renderStoreStatus();
            renderMenu();
            await writeAuditLog('store.schedule_update', { temporaryClosed:updatedSettings.temporaryClosed, dailyOrderCapacity:updatedSettings.dailyOrderCapacity });
            triggerToast('Store hours and closure settings saved.');
        } catch (error) {
            triggerToast(friendlyFirebaseError(error, 'Could not save store settings.'), 'danger');
        }
    }

    async function loadStoreSettings() {
        try {
            const snapshot = await getDoc(doc(db, "settings", "store"));
            if (snapshot.exists()) state.storeSettings = { ...state.storeSettings, ...snapshot.data() };
            state.storeOpen = state.storeSettings.isOpen !== false;
        } catch (error) {
            state.storeOpen = true;
            console.warn("Could not load store settings:", error);
        }
        evaluateStoreAvailability();
        renderWeekdayHours();
        renderStoreStatus();
        renderMenu();
    }

    function renderStoreStatus(refreshIcons = true) {
        const toggle = document.getElementById('store-open-toggle');
        const label = document.getElementById('store-open-label');
        const banner = document.getElementById('store-status-banner');
        const checkoutButton = document.getElementById('checkout-button');
        const liveChip = document.getElementById('live-store-chip');
        const liveChipText = document.getElementById('live-store-chip-text');
        evaluateStoreAvailability();
        if (toggle) toggle.checked = state.storeOpen;
        if (label) label.textContent = state.storeAcceptingOrders ? 'Store Open' : 'Store Closed';
        if (banner) {
            banner.style.display = state.storeAcceptingOrders ? 'none' : 'block';
            const title = document.getElementById('store-status-title');
            const message = document.getElementById('store-status-message');
            if (title) title.textContent = state.storeSettings.temporaryClosed ? 'The kitchen is temporarily closed.' : 'Ordering is currently unavailable.';
            if (message) message.textContent = state.storeStatusReason || 'You may browse the menu, but ordering is unavailable.';
        }
        if (checkoutButton) {
            checkoutButton.disabled = !state.storeAcceptingOrders || orderSubmissionInProgress;
            checkoutButton.innerHTML = state.storeAcceptingOrders ? 'Place Order <i data-lucide="arrow-right" style="width:16px;"></i>' : 'Store Closed';
        }
        if (liveChip && liveChipText) {
            liveChip.classList.toggle('open', state.storeAcceptingOrders);
            liveChipText.textContent = state.storeAcceptingOrders ? getLiveStoreStatusText() : 'Kitchen closed';
            liveChip.title = state.storeStatusReason || liveChipText.textContent;
        }
        updateCustomerGreeting();
        if (refreshIcons) lucide.createIcons();
    }

    let menuCategoryScrollFrame = 0;
    let menuCategoryScrollPane = null;

    function setActiveMenuCategory(index, keepVisible = true) {
        const categoryNav = document.getElementById('customer-category-nav');
        if (!categoryNav) return;
        const links = [...categoryNav.querySelectorAll('.customer-category-link')];
        const activeLink = links.find(link => Number(link.dataset.categoryIndex) === Number(index));
        if (!activeLink || activeLink.classList.contains('active')) return;

        links.forEach(link => {
            const isActive = link === activeLink;
            link.classList.toggle('active', isActive);
            if (isActive) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        });

        if (keepVisible) {
            const targetLeft = activeLink.offsetLeft - (categoryNav.clientWidth - activeLink.offsetWidth) / 2;
            categoryNav.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        }
    }

    function updateActiveMenuCategoryFromScroll() {
        menuCategoryScrollFrame = 0;
        const scrollPane = document.querySelector('main');
        const sections = [...document.querySelectorAll('#menu-container .menu-category-section[id^="menu-category-"]')];
        if (!scrollPane || !sections.length || document.body.classList.contains('staff-workspace') || document.body.classList.contains('checkout-active')) return;

        const activationLine = scrollPane.getBoundingClientRect().top + 28;
        let activeIndex = 0;
        sections.forEach((section, index) => {
            if (section.getBoundingClientRect().top <= activationLine) activeIndex = index;
        });

        const atBottom = scrollPane.scrollTop + scrollPane.clientHeight >= scrollPane.scrollHeight - 3;
        if (atBottom) activeIndex = sections.length - 1;
        setActiveMenuCategory(activeIndex);
    }

    function setupMenuCategoryScrollSpy() {
        const scrollPane = document.querySelector('main');
        if (!scrollPane) return;
        if (menuCategoryScrollPane !== scrollPane) {
            menuCategoryScrollPane?.removeEventListener('scroll', handleMenuCategoryScroll);
            menuCategoryScrollPane = scrollPane;
            menuCategoryScrollPane.addEventListener('scroll', handleMenuCategoryScroll, { passive: true });
        }
        requestAnimationFrame(updateActiveMenuCategoryFromScroll);
    }

    function handleMenuCategoryScroll() {
        if (menuCategoryScrollFrame) return;
        menuCategoryScrollFrame = requestAnimationFrame(updateActiveMenuCategoryFromScroll);
    }

    function scrollToMenuCategory(index, button) {
        const section = document.getElementById(`menu-category-${index}`);
        if (!section) return;
        setActiveMenuCategory(index);
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getLiveStoreStatusText() {
        const now = new Date();
        const day = WEEKDAYS[now.getDay()];
        const hours = state.storeSettings.weeklyHours?.[day.key];
        if (hours?.enabled && hours.close) {
            const [hour, minute] = String(hours.close).split(':').map(Number);
            const closeTime = new Date(now);
            closeTime.setHours(hour, minute, 0, 0);
            if (closeTime <= now) closeTime.setDate(closeTime.getDate() + 1);
            return `Open · closes ${closeTime.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}`;
        }
        return 'Open now';
    }

    async function setStoreOpen(isOpen) {
        if (!hasAdminAccess()) {
            renderStoreStatus();
            triggerToast("Admin access is required.", "danger");
            return;
        }
        const previousValue = state.storeOpen;
        state.storeOpen = Boolean(isOpen);
        renderStoreStatus();
        renderMenu();
        try {
            state.storeSettings.isOpen = state.storeOpen;
            await setDoc(doc(db, "settings", "store"), { isOpen: state.storeOpen, updatedAt: new Date().toISOString() }, { merge: true });
            await writeAuditLog('store.status_change', { changes: { Store: { from: previousValue ? 'Open' : 'Closed', to: state.storeOpen ? 'Open' : 'Closed' } } });
            triggerToast(state.storeOpen ? "The store is now open." : "The store is now closed.");
        } catch (error) {
            state.storeOpen = previousValue;
            renderStoreStatus();
            renderMenu();
            triggerToast(error.message || "Could not update store status.", "danger");
        }
    }

    async function toggleMenuItemVisibility(itemId) {
        if (!hasAdminAccess()) {
            triggerToast("Admin access is required.", "danger");
            return;
        }
        const item = menuData.find(menuItem => String(menuItem.id) === String(itemId));
        if (!item) return;
        const previousValue = item.isVisible;
        item.isVisible = item.isVisible === false;
        renderAdminMenuTable();
        renderMenu();
        try {
            await setDoc(doc(db, "items", String(itemId)), {
                isVisible: item.isVisible,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            await writeAuditLog('item.visibility_change', { itemId: String(itemId), itemName: item.name, changes: { Visibility: { from: previousValue === false ? 'Hidden' : 'Visible', to: item.isVisible ? 'Visible' : 'Hidden' } } });
            writeCachedMenu(menuData);
            triggerToast(item.isVisible ? `“${item.name}” is now available.` : `“${item.name}” is now hidden.`);
        } catch (error) {
            item.isVisible = previousValue;
            renderAdminMenuTable();
            renderMenu();
            triggerToast(error.message || "Could not update item visibility.", "danger");
        }
    }

    async function loadMenuCategories() {
        const itemCategories = menuData.map(item => item.category).filter(Boolean);
        try {
            const snapshot = await getDoc(doc(db, "settings", "menuCategories"));
            const savedCategories = snapshot.exists() && Array.isArray(snapshot.data().categories)
                ? snapshot.data().categories
                : DEFAULT_CATEGORIES;
            state.categories = [...new Set([...savedCategories, ...itemCategories])];
            state.hiddenCategories = snapshot.exists() && Array.isArray(snapshot.data().hiddenCategories)
                ? snapshot.data().hiddenCategories.filter(category => state.categories.includes(category))
                : [];
        } catch (error) {
            state.categories = [...new Set([...DEFAULT_CATEGORIES, ...itemCategories])];
            console.warn("Could not load menu categories:", error);
        }
        renderCategoryManager();
        renderMenu();
    }

    function renderCategoryManager(selectedCategory, refreshIcons = true) {
        const select = document.getElementById('menu-item-category');
        if (!select) return;
        const previousValue = selectedCategory || select.value;
        select.innerHTML = state.categories.map(category => `<option value="${category}">${category}</option>`).join('');
        if (state.categories.includes(previousValue)) select.value = previousValue;

        const chipList = document.getElementById('category-chip-list');
        if (chipList) {
            chipList.innerHTML = state.categories.map(category => `
                <span class="category-chip ${state.hiddenCategories.includes(category) ? 'hidden-category' : ''}" draggable="true" ondragstart='startCategoryDrag(${JSON.stringify(category)})' ondragover="event.preventDefault()" ondrop='dropCategoryBefore(${JSON.stringify(category)})'>
                    <i data-lucide="grip-vertical" style="width:13px; color:var(--text-muted); cursor:grab;"></i>
                    ${category}
                    <button type="button" onclick='renameMenuCategory(${JSON.stringify(category)})' aria-label="Rename ${category}" title="Rename category"><i data-lucide="pencil" style="width:13px;"></i></button>
                    <button type="button" onclick='toggleCategoryVisibility(${JSON.stringify(category)})' aria-label="${state.hiddenCategories.includes(category) ? 'Show' : 'Hide'} ${category}" title="${state.hiddenCategories.includes(category) ? 'Show category' : 'Hide category'}">
                        <i data-lucide="${state.hiddenCategories.includes(category) ? 'eye-off' : 'eye'}" style="width:13px;"></i>
                    </button>
                    <button type="button" onclick='removeMenuCategory(${JSON.stringify(category)})' aria-label="Remove ${category}" title="Remove category">
                        <i data-lucide="x" style="width:13px;"></i>
                    </button>
                </span>
            `).join('');
        }
        handleMenuCategoryChange();
        if (refreshIcons) lucide.createIcons();
    }

    async function saveMenuCategories() {
        await setDoc(doc(db, "settings", "menuCategories"), {
            categories: state.categories,
            hiddenCategories: state.hiddenCategories,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    }

    function startCategoryDrag(category) {
        draggedCategoryName = category;
    }

    async function dropCategoryBefore(targetCategory) {
        if (!draggedCategoryName || draggedCategoryName === targetCategory) return;
        const previousCategories = [...state.categories];
        const reordered = state.categories.filter(category => category !== draggedCategoryName);
        reordered.splice(reordered.indexOf(targetCategory), 0, draggedCategoryName);
        state.categories = reordered;
        draggedCategoryName = null;
        renderCategoryManager();
        renderMenu();
        try {
            await saveMenuCategories();
            await writeAuditLog('category.reorder', { changes: { Order: { from: previousCategories, to: state.categories } } });
        } catch (error) {
            state.categories = previousCategories;
            renderCategoryManager();
            renderMenu();
            triggerToast(error.message || 'Could not reorder categories.', 'danger');
        }
    }

    async function renameMenuCategory(category) {
        if (!hasAdminAccess()) return;
        const proposedName = prompt('New category name:', category);
        if (proposedName === null) return;
        const newName = proposedName.trim().replace(/\s+/g, ' ');
        if (!newName || !/^[a-zA-Z0-9 &'-]+$/.test(newName) || state.categories.some(item => item !== category && item.toLowerCase() === newName.toLowerCase())) {
            triggerToast('Enter a unique valid category name.', 'danger');
            return;
        }
        try {
            const affectedItems = menuData.filter(item => item.category === category);
            await Promise.all(affectedItems.map(item => setDoc(doc(db, 'items', String(item.id)), { category: newName, updatedAt: new Date().toISOString() }, { merge: true })));
            affectedItems.forEach(item => { item.category = newName; });
            state.categories = state.categories.map(item => item === category ? newName : item);
            state.hiddenCategories = state.hiddenCategories.map(item => item === category ? newName : item);
            await saveMenuCategories();
            writeCachedMenu(menuData);
            renderCategoryManager(newName);
            renderAdminMenuTable();
            renderMenu();
            await writeAuditLog('category.rename', { changes: { 'Category name': { from: category, to: newName } }, affectedItems: affectedItems.length });
            triggerToast(`“${category}” renamed to “${newName}”.`);
        } catch (error) {
            await loadMenuItems();
            await loadMenuCategories();
            triggerToast(error.message || 'Could not rename the category.', 'danger');
        }
    }

    async function toggleCategoryVisibility(category) {
        if (!hasAdminAccess()) return;
        const previousHidden = [...state.hiddenCategories];
        state.hiddenCategories = state.hiddenCategories.includes(category)
            ? state.hiddenCategories.filter(item => item !== category)
            : [...state.hiddenCategories, category];
        renderCategoryManager();
        renderMenu();
        try {
            await saveMenuCategories();
            await writeAuditLog('category.visibility_change', { category, changes: { Visibility: { from: previousHidden.includes(category) ? 'Hidden' : 'Visible', to: state.hiddenCategories.includes(category) ? 'Hidden' : 'Visible' } } });
            triggerToast(state.hiddenCategories.includes(category) ? `“${category}” is hidden.` : `“${category}” is visible.`);
        } catch (error) {
            state.hiddenCategories = previousHidden;
            renderCategoryManager();
            renderMenu();
            triggerToast(error.message || "Could not update category visibility.", "danger");
        }
    }

    async function addMenuCategory() {
        if (!hasAdminAccess()) {
            triggerToast("Admin access is required.", "danger");
            return;
        }
        const input = document.getElementById('new-category-name');
        const category = input.value.trim().replace(/\s+/g, ' ');
        if (!category || !/^[a-zA-Z0-9 &'-]+$/.test(category)) {
            triggerToast("Enter a valid category name.", "danger");
            return;
        }
        if (state.categories.some(existing => existing.toLowerCase() === category.toLowerCase())) {
            triggerToast("That category already exists.", "danger");
            return;
        }
        const previousCategories = [...state.categories];
        state.categories.push(category);
        renderCategoryManager(category);
        input.value = '';
        try {
            await saveMenuCategories();
            await writeAuditLog('category.create', { category });
            triggerToast(`“${category}” category added.`);
        } catch (error) {
            state.categories = previousCategories;
            renderCategoryManager();
            triggerToast(error.message || "Could not save the category.", "danger");
        }
    }

    async function removeMenuCategory(category) {
        if (!hasAdminAccess()) {
            triggerToast("Admin access is required.", "danger");
            return;
        }
        if (menuData.some(item => item.category === category)) {
            triggerToast(`Move the items in “${category}” before removing it.`, "danger");
            return;
        }
        if (state.categories.length <= 1 || !confirm(`Remove the “${category}” category?`)) return;
        const previousCategories = [...state.categories];
        state.categories = state.categories.filter(existing => existing !== category);
        state.hiddenCategories = state.hiddenCategories.filter(existing => existing !== category);
        renderCategoryManager();
        try {
            await saveMenuCategories();
            await writeAuditLog('category.delete', { category });
            triggerToast(`“${category}” category removed.`);
        } catch (error) {
            state.categories = previousCategories;
            renderCategoryManager();
            triggerToast(error.message || "Could not remove the category.", "danger");
        }
    }

    function handleMenuCategoryChange() {
        const category = document.getElementById('menu-item-category').value;
        const isMeal = category === 'Combos' || category === 'Family Meals';
        document.getElementById('meal-builder-section').style.display = isMeal ? 'block' : 'none';
        if (isMeal && !document.querySelector('input[name="meal-build-mode"]:checked')) {
            document.querySelector('input[name="meal-build-mode"][value="existing"]').checked = true;
        }
        toggleMealBuildMode();
        lucide.createIcons();
    }

    function toggleMealBuildMode() {
        const mode = document.querySelector('input[name="meal-build-mode"]:checked')?.value || 'existing';
        const category = document.getElementById('menu-item-category').value;
        const enabled = (category === 'Combos' || category === 'Family Meals') && mode === 'existing';
        document.getElementById('existing-meal-items-editor').style.display = enabled ? 'block' : 'none';
        document.querySelectorAll('#meal-items-container select, #meal-items-container input').forEach(control => {
            control.disabled = !enabled;
        });
    }

    function addMealItemRow(mealItem = {}) {
        const currentEditId = document.getElementById('menu-item-edit-id').value;
        const availableItems = menuData.filter(item => String(item.id) !== String(currentEditId));
        const row = document.createElement('div');
        row.className = 'meal-item-row';
        const substituteIds = Array.isArray(mealItem.substituteItemIds) ? mealItem.substituteItemIds.map(String) : [];
        row.innerHTML = `
            <select class="meal-component-id" required onchange="updateMealPriceSummary()">
                <option value="">Select an existing menu item</option>
                ${availableItems.map(item => `<option value="${item.id}" ${String(item.id) === String(mealItem.itemId) ? 'selected' : ''}>${item.name} · Rs. ${Number(item.price).toLocaleString()}</option>`).join('')}
            </select>
            <input type="number" class="meal-component-quantity" min="1" max="20" value="${Number(mealItem.quantity || 1)}" title="Quantity" required oninput="updateMealPriceSummary()">
            <button type="button" class="btn-danger" style="width:38px; height:38px; padding:0; justify-content:center;" onclick="this.parentElement.remove(); updateMealPriceSummary();"><i data-lucide="x" style="width:15px;"></i></button>
            <div class="meal-substitution-editor">
                <label>Allowed substitutes (Ctrl/Cmd-click to select multiple)</label>
                <select class="meal-component-substitutes" multiple>
                    ${availableItems.map(item => `<option value="${item.id}" ${substituteIds.includes(String(item.id)) ? 'selected' : ''}>${item.name}</option>`).join('')}
                </select>
            </div>
        `;
        document.getElementById('meal-items-container').appendChild(row);
        toggleMealBuildMode();
        updateMealPriceSummary();
        lucide.createIcons();
    }

    function collectMealItems() {
        return [...document.querySelectorAll('#meal-items-container .meal-item-row')].map(row => {
            const itemId = row.querySelector('.meal-component-id').value;
            const sourceItem = menuData.find(item => String(item.id) === String(itemId));
            return {
                itemId,
                name: sourceItem?.name || '',
                quantity: Number(row.querySelector('.meal-component-quantity').value || 1),
                substituteItemIds: [...row.querySelector('.meal-component-substitutes').selectedOptions].map(option => option.value)
            };
        }).filter(item => item.itemId);
    }

    function calculateMealOriginalPrice(mealItems) {
        return (Array.isArray(mealItems) ? mealItems : []).reduce((sum, component) => {
            const sourceItem = menuData.find(item => String(item.id) === String(component.itemId));
            return sum + (sourceItem ? Number(sourceItem.price || 0) * Number(component.quantity || 1) : 0);
        }, 0);
    }

    function updateMealPriceSummary() {
        const summary = document.getElementById('meal-price-summary');
        if (!summary) return;
        const originalPrice = calculateMealOriginalPrice(collectMealItems());
        const sellingPrice = Number(document.getElementById('menu-item-price')?.value || 0);
        const savings = Math.max(0, originalPrice - sellingPrice);
        summary.innerHTML = originalPrice
            ? `<strong style="color:var(--text-main);">Original components: Rs. ${originalPrice.toLocaleString()}</strong>${sellingPrice ? ` · Customer saves Rs. ${savings.toLocaleString()}` : ' · Enter the selling price to calculate savings.'}`
            : 'Add components to calculate the original price and customer savings.';
    }

    function addAdminOptionRow(type, option = {}) {
        const container = document.getElementById('menu-variants-container');
        const row = document.createElement('div');
        row.className = `admin-option-row variant-option-row`;
        row.innerHTML = `
            <input type="text" class="option-name" placeholder="e.g. Large" value="${option.name || ''}" required>
            <input type="number" class="option-price" min="0" step="1" placeholder="Extra Rs." value="${Number(option.priceAdjustment || 0)}" required>
            <button type="button" class="btn-danger" style="width:38px; height:38px; padding:0; justify-content:center;" onclick="this.parentElement.remove()" title="Remove option">
                <i data-lucide="x" style="width:15px;"></i>
            </button>
        `;
        container.appendChild(row);
        lucide.createIcons();
    }

    function collectAdminOptions() {
        return [...document.querySelectorAll('#menu-variants-container .variant-option-row')].map(row => ({
            name: row.querySelector('.option-name').value.trim(),
            priceAdjustment: Number(row.querySelector('.option-price').value || 0)
        })).filter(option => option.name);
    }

    function addAdminAddonGroup(group = {}) {
        const groupElement = document.createElement('div');
        const groupId = `addon-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        groupElement.className = 'admin-addon-group';
        groupElement.dataset.groupId = groupId;
        groupElement.innerHTML = `
            <div class="admin-addon-group-header">
                <input type="text" class="addon-group-name" placeholder="Group name, e.g. Choose a drink" value="${group.name || ''}" required>
                <button type="button" class="btn-danger" style="width:38px; height:38px; padding:0; justify-content:center;" onclick="this.closest('.admin-addon-group').remove()" title="Remove group"><i data-lucide="trash-2" style="width:15px;"></i></button>
            </div>
            <div class="admin-addon-settings">
                <label class="admin-check-label"><input type="checkbox" class="addon-group-required" ${group.required ? 'checked' : ''} onchange="syncAddonGroupLimits(this.closest('.admin-addon-group'))"> <span><strong>Required</strong><br><small style="color:var(--text-muted);">Customer must select</small></span></label>
                <label class="admin-check-label"><input type="checkbox" class="addon-group-multiple" ${group.multiple ? 'checked' : ''} onchange="syncAddonGroupLimits(this.closest('.admin-addon-group'))"> <span><strong>Allow multiple</strong><br><small style="color:var(--text-muted);">More than one option</small></span></label>
            </div>
            <div class="addon-limit-grid">
                <label>Minimum selections
                    <input type="number" class="addon-group-min" min="0" max="50" value="${Number(group.minSelections ?? (group.required ? 1 : 0))}" required>
                </label>
                <label>Maximum selections
                    <input type="number" class="addon-group-max" min="1" max="50" value="${Number(group.maxSelections ?? (group.multiple ? Math.max(1, group.options?.length || 1) : 1))}" required>
                </label>
            </div>
            <div class="admin-addon-option-head"><span>Option name</span><span>Extra price</span><span></span></div>
            <div class="admin-addon-options"></div>
            <button type="button" class="btn-secondary" style="width:100%; margin-top:8px; padding:8px;" onclick="addAdminAddonOption(this.closest('.admin-addon-group'))"><i data-lucide="plus" style="width:14px;"></i> Add Group Option</button>
        `;
        document.getElementById('menu-addon-groups-container').appendChild(groupElement);
        const options = Array.isArray(group.options) ? group.options : [];
        options.forEach((option, index) => addAdminAddonOption(groupElement, option, index === Number(group.defaultOptionIndex)));
        if (!options.length) addAdminAddonOption(groupElement, {}, true);
        syncAddonGroupLimits(groupElement);
        lucide.createIcons();
    }

    function addAdminAddonOption(groupElement, option = {}, isDefault = false) {
        const optionsContainer = groupElement.querySelector('.admin-addon-options');
        const row = document.createElement('div');
        row.className = 'admin-addon-option-row';
        row.innerHTML = `
            <input type="text" class="addon-option-name" placeholder="e.g. Pepsi" value="${option.name || ''}" required>
            <input type="number" class="addon-option-price" min="0" step="1" placeholder="Extra Rs." value="${Number(option.priceAdjustment || 0)}" required>
            <button type="button" class="btn-danger" style="width:34px; height:34px; padding:0; justify-content:center;" onclick="this.parentElement.remove()"><i data-lucide="x" style="width:14px;"></i></button>
            <div class="admin-addon-option-footer">
                <label class="admin-check-label default-option-label"><input type="radio" class="addon-option-default" name="default-${groupElement.dataset.groupId}" ${isDefault ? 'checked' : ''}> Use as default selection</label>
            </div>
        `;
        optionsContainer.appendChild(row);
        if (!optionsContainer.querySelector('.addon-option-default:checked')) row.querySelector('.addon-option-default').checked = true;
        lucide.createIcons();
    }

    function syncAddonGroupLimits(groupElement) {
        const required = groupElement.querySelector('.addon-group-required').checked;
        const multiple = groupElement.querySelector('.addon-group-multiple').checked;
        const minInput = groupElement.querySelector('.addon-group-min');
        const maxInput = groupElement.querySelector('.addon-group-max');
        if (required && Number(minInput.value) < 1) minInput.value = '1';
        if (!required && Number(minInput.value) === 1) minInput.value = '0';
        if (!multiple) {
            maxInput.value = '1';
            maxInput.disabled = true;
            if (Number(minInput.value) > 1) minInput.value = '1';
        } else {
            maxInput.disabled = false;
        }
    }

    function applyMealTemplate(type) {
        const container = document.getElementById('menu-addon-groups-container');
        if (container.children.length && !confirm('Replace the current add-on groups with this meal template?')) return;
        container.innerHTML = '';

        const drinkGroup = {
            name: 'Choose a drink',
            required: true,
            multiple: false,
            defaultOptionIndex: 0,
            options: [
                { name: 'Pepsi', priceAdjustment: 0 },
                { name: '7Up', priceAdjustment: 0 },
                { name: 'Water', priceAdjustment: 0 }
            ]
        };

        if (type === 'combo') {
            document.getElementById('menu-item-category').value = 'Combos';
            addAdminAddonGroup(drinkGroup);
        } else {
            document.getElementById('menu-item-category').value = 'Family Meals';
            addAdminAddonGroup(drinkGroup);
            addAdminAddonGroup({
                name: 'Choose a side',
                required: true,
                multiple: false,
                defaultOptionIndex: 0,
                options: [
                    { name: 'Regular Fries', priceAdjustment: 0 },
                    { name: 'Loaded Fries', priceAdjustment: 250 },
                    { name: 'Onion Rings', priceAdjustment: 200 }
                ]
            });
        }
        document.querySelector('input[name="meal-build-mode"][value="existing"]').checked = true;
        handleMenuCategoryChange();
        if (!document.querySelector('#meal-items-container .meal-item-row')) addMealItemRow();
        triggerToast(`${type === 'combo' ? 'Combo' : 'Family Meal'} template applied.`);
    }

    function collectAdminAddonGroups() {
        return [...document.querySelectorAll('#menu-addon-groups-container .admin-addon-group')].map(groupElement => {
            const optionRows = [...groupElement.querySelectorAll('.admin-addon-option-row')];
            const options = optionRows.map(row => ({
                name: row.querySelector('.addon-option-name').value.trim(),
                priceAdjustment: Number(row.querySelector('.addon-option-price').value || 0)
            })).filter(option => option.name);
            const defaultRow = optionRows.findIndex(row => row.querySelector('.addon-option-default').checked);
            const multiple = groupElement.querySelector('.addon-group-multiple').checked;
            const minSelections = Math.max(0, Number(groupElement.querySelector('.addon-group-min').value || 0));
            const requestedMax = Math.max(1, Number(groupElement.querySelector('.addon-group-max').value || 1));
            const maxSelections = multiple ? Math.min(options.length, requestedMax) : 1;
            return {
                name: groupElement.querySelector('.addon-group-name').value.trim(),
                required: minSelections > 0,
                multiple,
                minSelections: Math.min(minSelections, maxSelections),
                maxSelections,
                defaultOptionIndex: Math.max(0, defaultRow),
                options
            };
        }).filter(group => group.name && group.options.length);
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!hasAdminAccess()) {
            triggerToast("Admin access is required.", "danger");
            return;
        }

        const editId = document.getElementById('menu-item-edit-id').value;
        const existingItem = editId ? menuData.find(item => String(item.id) === String(editId)) : null;
        const category = document.getElementById('menu-item-category').value;
        const isMeal = category === 'Combos' || category === 'Family Meals';
        const mealMode = isMeal ? (document.querySelector('input[name="meal-build-mode"]:checked')?.value || 'standalone') : null;
        const mealItems = isMeal && mealMode === 'existing' ? collectMealItems() : [];
        if (isMeal && mealMode === 'existing' && !mealItems.length) {
            triggerToast("Select at least one existing menu item for this meal.", "danger");
            return;
        }
        const itemData = {
            name: document.getElementById('menu-item-name').value.trim(),
            price: Number(document.getElementById('menu-item-price').value),
            category,
            img: document.getElementById('menu-item-img').value.trim(),
            availableFrom: document.getElementById('menu-available-from').value ? new Date(document.getElementById('menu-available-from').value).toISOString() : null,
            availableUntil: document.getElementById('menu-available-until').value ? new Date(document.getElementById('menu-available-until').value).toISOString() : null,
            stockQuantity: document.getElementById('menu-item-stock').value === '' ? null : Math.max(0, Math.floor(Number(document.getElementById('menu-item-stock').value))),
            lowStockThreshold: Math.max(0, Math.floor(Number(document.getElementById('menu-item-low-stock').value || 5))),
            desc: document.getElementById('menu-item-desc').value.trim(),
            labels: [...document.querySelectorAll('input[name="menu-label"]:checked')].map(input => input.value),
            variants: collectAdminOptions(),
            addonGroups: collectAdminAddonGroups(),
            mealMode,
            mealItems,
            originalComponentPrice: calculateMealOriginalPrice(mealItems),
            isVisible: editId
                ? menuData.find(item => String(item.id) === String(editId))?.isVisible !== false
                : true,
            isSoldOut: document.getElementById('menu-item-stock').value !== '' && Number(document.getElementById('menu-item-stock').value) <= 0
                ? true
                : (editId ? Boolean(menuData.find(item => String(item.id) === String(editId))?.isSoldOut) : false),
            updatedAt: new Date().toISOString()
        };

        const submitButton = document.getElementById('btn-submit-action');
        submitButton.disabled = true;
        submitButton.textContent = editId ? 'Saving Changes...' : 'Adding Item...';

        try {
            if (editId) {
                await setDoc(doc(db, "items", editId), itemData, { merge: true });
                const changes = buildItemChangeSet(existingItem, itemData);
                await writeAuditLog('item.update', { itemId: editId, itemName: itemData.name, changes });
                triggerToast("Menu item updated successfully!");
            } else {
                const newItemRef = doc(collection(db, "items"));
                await setDoc(newItemRef, { ...itemData, createdAt: new Date().toISOString() });
                await writeAuditLog('item.create', { itemId: newItemRef.id, itemName: itemData.name, category: itemData.category });
                triggerToast("Menu item added successfully!");
            }
            resetFormState();
            await loadMenuItems();
        } catch (error) {
            triggerToast(error.message || "Could not save the menu item.", "danger");
        } finally {
            submitButton.disabled = false;
        }
    }

    function editMenuItem(itemId) {
        const item = menuData.find(menuItem => String(menuItem.id) === String(itemId));
        if (!item) return;

        document.getElementById('menu-item-edit-id').value = String(item.id);
        document.getElementById('menu-item-name').value = item.name;
        document.getElementById('menu-item-price').value = item.price;
        document.getElementById('menu-item-category').value = item.category;
        handleMenuCategoryChange();
        document.getElementById('meal-items-container').innerHTML = '';
        if (item.category === 'Combos' || item.category === 'Family Meals') {
            const mealMode = item.mealMode || (Array.isArray(item.mealItems) && item.mealItems.length ? 'existing' : 'standalone');
            const modeInput = document.querySelector(`input[name="meal-build-mode"][value="${mealMode}"]`);
            if (modeInput) modeInput.checked = true;
            toggleMealBuildMode();
            (Array.isArray(item.mealItems) ? item.mealItems : []).forEach(mealItem => addMealItemRow(mealItem));
            if (mealMode === 'existing' && !item.mealItems?.length) addMealItemRow();
        }
        document.getElementById('menu-item-img').value = item.img || '';
        document.getElementById('menu-item-stock').value = getStockQuantity(item) ?? '';
        document.getElementById('menu-item-low-stock').value = Number(item.lowStockThreshold ?? 5);
        document.getElementById('menu-available-from').value = item.availableFrom ? new Date(item.availableFrom).toISOString().slice(0,16) : '';
        document.getElementById('menu-available-until').value = item.availableUntil ? new Date(item.availableUntil).toISOString().slice(0,16) : '';
        document.getElementById('menu-item-desc').value = item.desc;
        document.querySelectorAll('input[name="menu-label"]').forEach(input => {
            input.checked = Array.isArray(item.labels) && item.labels.includes(input.value);
        });
        document.getElementById('menu-variants-container').innerHTML = '';
        document.getElementById('menu-addon-groups-container').innerHTML = '';
        (Array.isArray(item.variants) ? item.variants : []).forEach(option => addAdminOptionRow('variant', option));
        const groups = Array.isArray(item.addonGroups) ? item.addonGroups : [];
        if (groups.length) {
            groups.forEach(group => addAdminAddonGroup(group));
        } else if (Array.isArray(item.addons) && item.addons.length) {
            addAdminAddonGroup({ name: 'Extras', required: false, multiple: true, defaultOptionIndex: 0, options: item.addons });
        }
        document.getElementById('form-workspace-title').innerHTML = `<i data-lucide="pencil" style="color:var(--accent);"></i> Edit Menu Item`;
        document.getElementById('btn-submit-action').textContent = 'Save Changes';
        document.getElementById('btn-cancel-edit').style.display = 'flex';
        document.getElementById('item-editor-modal').classList.add('active');
        lucide.createIcons();
        document.getElementById('item-editor-modal-body').scrollTop = 0;
    }

    async function removeMenuItem(itemId) {
        if (!hasAdminAccess()) {
            triggerToast("Admin access is required.", "danger");
            return;
        }
        const item = menuData.find(menuItem => String(menuItem.id) === String(itemId));
        if (!item || !confirm(`Remove "${item.name}" from the menu?`)) return;

        try {
            await deleteDoc(doc(db, "items", String(itemId)));
            await writeAuditLog('item.delete', { itemId: String(itemId), itemName: item.name });
            if (document.getElementById('menu-item-edit-id').value === String(itemId)) resetFormState();
            await loadMenuItems();
            triggerToast("Menu item removed successfully!");
        } catch (error) {
            triggerToast(error.message || "Could not remove the menu item.", "danger");
        }
    }

    function resetFormState() {
        document.getElementById('add-menu-form').reset();
        document.getElementById('menu-item-edit-id').value = '';
        document.getElementById('meal-items-container').innerHTML = '';
        document.getElementById('meal-builder-section').style.display = 'none';
        document.getElementById('menu-variants-container').innerHTML = '';
        document.getElementById('menu-addon-groups-container').innerHTML = '';
        document.getElementById('menu-item-stock').value = '';
        document.getElementById('menu-item-low-stock').value = '5';
        document.getElementById('form-workspace-title').innerHTML = `<i data-lucide="plus-circle" style="color:var(--accent);"></i> Add New Item`;
        document.getElementById('btn-submit-action').textContent = 'Add to Menu Live';
        document.getElementById('btn-cancel-edit').style.display = 'none';
        document.getElementById('item-editor-modal')?.classList.remove('active');
        lucide.createIcons();
    }

    function setCustomerMenuFilter(type, value) {
        if (type === 'search') state.customerMenuSearch = value.trim();
        if (type === 'category') state.customerMenuCategory = value;
        if (type === 'availability') state.customerMenuAvailability = value;
        if (type === 'price') state.customerMenuPrice = value;
        renderMenu();
        if (type === 'search') {
            clearTimeout(analyticsSearchTimer);
            analyticsSearchTimer = setTimeout(() => {
                if (state.customerMenuSearch) {
                    trackAnalyticsEvent('search', {
                        search_term: state.customerMenuSearch.slice(0, 100)
                    });
                }
            }, 700);
        } else {
            trackAnalyticsEvent('menu_filter_used', {
                filter_type: type,
                filter_value: String(value).slice(0, 100)
            });
        }
    }

    function syncCustomerCategoryFilter() {
        const select = document.getElementById('customer-category-filter');
        if (!select) return;
        const selected = state.customerMenuCategory;
        select.innerHTML = '<option value="all">All categories</option>' + state.categories.filter(category => !state.hiddenCategories.includes(category)).map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
        select.value = selected;
    }

    function loadCustomerOrderHistory() {
        if (stopCustomerOrdersListener) { stopCustomerOrdersListener(); stopCustomerOrdersListener = null; }
        state.customerOrders = [];
        if (!state.currentUser || state.currentUser.role !== 'customer') {
            renderCustomerOrderHistory();
            return;
        }
        stopCustomerOrdersListener = onSnapshot(query(collection(db, 'orders'), where('userId', '==', state.currentUser.uid)), snapshot => {
            state.customerOrders = snapshot.docs.map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() })).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            renderCustomerOrderHistory();
        }, error => triggerToast(error.message || 'Could not load your order history.', 'danger'));
    }

    function renderCustomerOrderHistory() {
        const section = document.getElementById('customer-order-history');
        const list = document.getElementById('customer-order-history-list');
        const show = state.currentUser?.role === 'customer';
        if (!section || !list) return;
        section.style.display = show ? 'block' : 'none';
        if (!show) return;
        const completedOrders = state.customerOrders.filter(order => String(order.status || '').toLowerCase() === 'completed');
        list.innerHTML = completedOrders.length ? completedOrders.map(order => {
            const items = Array.isArray(order.items) ? order.items : [];
            const itemRows = items.map(item => {
                const quantity = Math.max(1, Number(item.quantity || item.qty || 1));
                const itemName = item.name || item.itemName || 'Menu item';
                const variantName = item.selectedVariant?.name || item.variantName || '';
                const addons = (item.selectedAddons || item.addons || []).map(addon => addon.name || addon.optionName).filter(Boolean);
                const mealItems = (item.selectedMealItems || item.mealItems || []).map(component => component.name).filter(Boolean);
                const details = [
                    variantName ? `Option: ${variantName}` : '',
                    addons.length ? `Add-ons: ${addons.join(', ')}` : '',
                    mealItems.length ? `Includes: ${mealItems.join(', ')}` : '',
                    item.instructions ? `Instructions: ${item.instructions}` : ''
                ].filter(Boolean);
                const unitPrice = Number(item.finalPrice ?? item.unitPrice ?? item.price ?? 0);
                return `<div class="customer-order-item"><div><div class="customer-order-item-name">${quantity} × ${escapeHtml(itemName)}</div>${details.length ? `<div class="customer-order-item-meta">${details.map(escapeHtml).join('<br>')}</div>` : ''}</div><div class="customer-order-item-price">Rs. ${(unitPrice * quantity).toLocaleString()}</div></div>`;
            }).join('');
            const completedDate = order.completedAt ? new Date(order.completedAt) : getOrderDate(order);
            return `<article class="customer-order-card"><div class="customer-order-head"><div><strong>${escapeHtml(order.orderNumber || order.id)}</strong><p style="color:var(--text-muted);font-size:.74rem;margin-top:4px">Completed ${completedDate?.toLocaleString() || ''}</p></div><span class="badge-status completed">Completed</span></div><div class="customer-order-items">${itemRows || '<div class="customer-order-item"><span class="customer-order-item-meta">Item details are unavailable for this older order.</span></div>'}</div><div class="customer-order-total"><span>Order total</span><strong>Rs. ${Number(order.total || 0).toLocaleString()}</strong></div><div class="customer-order-actions"><button class="btn-primary" onclick='orderAgain(${JSON.stringify(order.id)})'><i data-lucide="rotate-ccw"></i> Order Again</button></div></article>`;
        }).join('') : '<div class="card" style="text-align:center;color:var(--text-muted)">No completed orders yet. Completed orders will appear here so you can reorder them easily.</div>';
        lucide.createIcons();
    }

    async function cancelPendingOrder(orderId) {
        const order = state.customerOrders.find(item => item.id === orderId);
        if (!order || !['pending','new'].includes(String(order.status || 'pending'))) return;
        if (!confirm(`Cancel ${order.orderNumber || 'this order'}? This cannot be undone.`)) return;
        try {
            await setDoc(doc(db, 'orders', orderId), { status:'cancelled', cancelledAt:new Date().toISOString(), cancelledById:state.currentUser.uid, updatedAt:new Date().toISOString() }, { merge:true });
            trackAnalyticsEvent('order_cancelled', {
                order_status: String(order.status || 'pending'),
                order_type: String(order.fulfilmentType || 'unknown')
            });
            triggerToast('Order cancelled.');
        } catch (error) { triggerToast(error.message || 'Could not cancel the order.', 'danger'); }
    }

    function orderAgain(orderId) {
        const order = state.customerOrders.find(item => item.id === orderId);
        if (!order || !Array.isArray(order.items)) return;
        const restored = order.items.flatMap(saved => {
            const currentItem = menuData.find(item => String(item.id) === String(saved.id || saved.itemId));
            if (!isMenuItemAvailable(currentItem)) return [];
            const quantity = Math.max(1, Math.min(20, Number(saved.quantity || saved.qty || 1)));
            const selectedVariant = saved.selectedVariant
                ? (currentItem.variants || []).find(variant => variant.name === saved.selectedVariant.name)
                : null;
            if (saved.selectedVariant && !selectedVariant) return [];
            const selectedAddons = (saved.selectedAddons || []).map(selected => {
                const group = (currentItem.addonGroups || []).find(candidate => candidate.name === selected.groupName);
                const option = (group?.options || []).find(candidate => candidate.name === selected.name);
                return option ? { ...option, groupName:group.name } : null;
            }).filter(Boolean);
            if (selectedAddons.length !== (saved.selectedAddons || []).length) return [];
            const selectedMealItems = (saved.selectedMealItems || saved.mealItems || []).map((selected, index) => {
                const component = currentItem.mealItems?.[index];
                const allowedIds = component ? [component.itemId, ...(component.substituteItemIds || [])].map(String) : [];
                const selectedItem = menuData.find(item => String(item.id) === String(selected.itemId));
                return component && allowedIds.includes(String(selected.itemId)) && isBasicItemAvailable(selectedItem)
                    ? { itemId:String(selectedItem.id), name:selectedItem.name, quantity:Number(component.quantity || 1) }
                    : null;
            }).filter(Boolean);
            if (selectedMealItems.length !== (saved.selectedMealItems || saved.mealItems || []).length) return [];
            const finalPrice = Number(currentItem.price)
                + Number(selectedVariant?.priceAdjustment || 0)
                + selectedAddons.reduce((sum, addon) => sum + Number(addon.priceAdjustment || 0), 0);
            const optionKey = JSON.stringify({
                variant:selectedVariant?.name || '',
                addons:selectedAddons.map(addon => `${addon.groupName}:${addon.name}`).sort(),
                mealItems:selectedMealItems.map(component => component.itemId),
                instructions:String(saved.instructions || '').slice(0, 250)
            });
            return [{
                id:String(currentItem.id),
                cartKey:`${currentItem.id}::${optionKey}`,
                name:currentItem.name,
                price:finalPrice,
                selectedVariant,
                selectedAddons,
                selectedMealItems,
                instructions:String(saved.instructions || '').slice(0, 250),
                qty:quantity
            }];
        });
        if (!restored.length) { triggerToast('Those items are not currently available.', 'danger'); return; }
        state.cart = restored;
        renderCart();
        document.getElementById('cart-pane-element')?.classList.remove('hidden');
        trackAnalyticsEvent('order_again', {
            item_count: restored.reduce((sum, item) => sum + Number(item.qty || 1), 0)
        });
        const skipped = order.items.length - restored.length;
        triggerToast(`${restored.length} item(s) restored to your basket${skipped ? `; ${skipped} unavailable item(s) were skipped` : ''}. Review prices before checkout.`);
    }

    function renderOrderAnalytics(orders) {
        const host = document.getElementById('order-analytics-grid');
        if (!host || !state.currentUser || (!hasAdminAccess() && !hasOrderManagerAccess())) return;
        const itemCounts = {}, hourCounts = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => itemCounts[item.name || 'Item'] = (itemCounts[item.name || 'Item'] || 0) + Number(item.quantity || 1));
            const hour = getOrderDate(order)?.getHours(); if (hour != null) hourCounts[`${String(hour).padStart(2,'0')}:00`] = (hourCounts[`${String(hour).padStart(2,'0')}:00`] || 0) + 1;
        });
        const rejected = orders.filter(order => order.status === 'rejected').length;
        const bars = (values, limit=4) => {
            const rows = Object.entries(values).sort((a,b)=>b[1]-a[1]).slice(0,limit), max = Math.max(1,...rows.map(row=>row[1]));
            return rows.length ? rows.map(([label,value])=>`<div class="bar-row"><span>${escapeHtml(label)}</span><span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.round(value/max*100)}%"></span></span><strong>${value}</strong></div>`).join('') : '<p style="color:var(--text-muted);font-size:.75rem">No data in this range.</p>';
        };
        host.innerHTML = `<div class="card mini-chart"><h3>Popular Items</h3>${bars(itemCounts)}</div><div class="card mini-chart"><h3>Peak Hours</h3>${bars(hourCounts)}</div><div class="card mini-chart"><h3>Rejection Rate</h3><p style="font-size:2rem;font-weight:850;margin-top:14px">${orders.length ? Math.round(rejected/orders.length*100) : 0}%</p><p style="color:var(--text-muted);font-size:.75rem">${rejected} of ${orders.length} orders</p></div>`;
    }

    function exportOrdersCsv() {
        const rows = [['Order','Created','Customer','Type','Status','Total','Items']];
        state.orders.forEach(order => rows.push([order.orderNumber || order.id, order.createdAt || '', order.customerName || '', order.fulfilmentType || order.deliveryType || 'delivery', order.status || 'pending', Number(order.total || 0), (order.items || []).map(item => `${item.quantity || 1}x ${item.name}`).join('; ')]));
        const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
        const link = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})), download:`snack-station-orders-${new Date().toISOString().slice(0,10)}.csv` });
        link.click(); URL.revokeObjectURL(link.href); triggerToast('Order report exported.');
    }

    async function requestOrderNotifications() {
        if (!('Notification' in window)) return triggerToast('Browser notifications are not supported.', 'danger');
        const permission = await Notification.requestPermission();
        triggerToast(permission === 'granted' ? 'New-order notifications enabled.' : 'Notification permission was not granted.', permission === 'granted' ? 'success' : 'danger');
    }

    let draggedItemId = null;
    function startItemDrag(event) { draggedItemId = event.currentTarget.dataset.itemId; event.dataTransfer.effectAllowed = 'move'; }
    function dropItemBefore(event) {
        event.preventDefault();
        const targetId = event.currentTarget.dataset.itemId;
        if (!draggedItemId || draggedItemId === targetId) return;
        const from = menuData.findIndex(item => String(item.id) === String(draggedItemId));
        const to = menuData.findIndex(item => String(item.id) === String(targetId));
        const [moved] = menuData.splice(from,1); menuData.splice(to,0,moved); renderAdminMenuTable();
    }
    async function saveMenuOrder() {
        if (!hasAdminAccess()) return;
        try { await Promise.all(menuData.map((item,index) => setDoc(doc(db,'items',String(item.id)), {sortOrder:index,updatedAt:new Date().toISOString()}, {merge:true}))); triggerToast('Menu order saved.'); }
        catch (error) { triggerToast(error.message || 'Could not save menu order.', 'danger'); }
    }
    async function duplicateMenuItem(itemId) {
        if (!hasAdminAccess()) return;
        const source = menuData.find(item => String(item.id) === String(itemId)); if (!source) return;
        const ref = doc(collection(db,'items')); const copy = {...source,name:`${source.name} Copy`,isVisible:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; delete copy.id;
        try { await setDoc(ref,copy); await loadMenuItems(); triggerToast('Item duplicated as a hidden draft.'); } catch(error) { triggerToast(error.message || 'Could not duplicate item.','danger'); }
    }

    window.addEventListener('online', () => { document.getElementById('connection-banner').style.display='none'; triggerToast('Back online.'); });
    window.addEventListener('offline', () => { const banner=document.getElementById('connection-banner'); banner.style.display='block'; banner.textContent='You are offline. Changes will sync when connection returns.'; });

    function applyMenuSorting() {
        renderMenu();
    }

    function changeMenuSorting(sortValue) {
        state.currentSort = sortValue;
        applyMenuSorting();
    }

    window.addToCart = addToCart;
    window.toggleTheme = toggleTheme;
    window.toggleWorkspaceSidebar = toggleWorkspaceSidebar;
    window.toggleWorkspaceMenu = toggleWorkspaceMenu;
    window.handleLogoNavigation = handleLogoNavigation;
    window.switchPanel = switchPanel;
    window.toggleCartVisibility = toggleCartVisibility;
    window.openCheckoutPage = openCheckoutPage;
    window.leaveCheckoutPage = leaveCheckoutPage;
    window.submitCheckoutPage = submitCheckoutPage;
    window.logOut = logOut;
    window.toggleAuthModal = toggleAuthModal;
    window.toggleAuthMode = toggleAuthMode;
    window.openSignupPage = openSignupPage;
    window.openSignInModal = openSignInModal;
    window.handleRegistrationSubmit = handleRegistrationSubmit;
    window.toggleSettingsModal = toggleSettingsModal;
    window.setCustomerProfileEditing = setCustomerProfileEditing;
    window.openCustomerTrackingFromAccount = openCustomerTrackingFromAccount;
    window.openCustomerOrdersFromAccount = openCustomerOrdersFromAccount;
    window.openSidebarSettings = openSidebarSettings;
    window.handleSettingsUpdate = handleSettingsUpdate;
    window.toggleAdminUserModal = toggleAdminUserModal;
    window.openAdminUserEditor = openAdminUserEditor;
    window.handleAdminUserUpdate = handleAdminUserUpdate;
    window.sendManagedUserPasswordReset = sendManagedUserPasswordReset;
    window.renderUsersTable = renderUsersTable;
    window.setUserRoleFilter = setUserRoleFilter;
    window.toggleGuestCheckoutModal = toggleGuestCheckoutModal;
    window.toggleItemCustomizationModal = toggleItemCustomizationModal;
    window.handleAuthSubmit = handleAuthSubmit;
    window.handleGoogleSignIn = handleGoogleSignIn;
    window.submitGuestOrder = submitGuestOrder;
    window.stopTrackingAndReturn = stopTrackingAndReturn;
    window.openOrderTracking = openOrderTracking;
    window.trackSavedOrder = trackSavedOrder;
    window.trackSavedOrderReference = trackSavedOrderReference;
    window.handleFormSubmit = handleFormSubmit;
    window.loadAuditLogs = loadAuditLogs;
    window.openNewItemModal = openNewItemModal;
    window.closeItemEditorModal = closeItemEditorModal;
    window.toggleCategoryManagerModal = toggleCategoryManagerModal;
    window.addMenuCategory = addMenuCategory;
    window.removeMenuCategory = removeMenuCategory;
    window.toggleCategoryVisibility = toggleCategoryVisibility;
    window.startCategoryDrag = startCategoryDrag;
    window.dropCategoryBefore = dropCategoryBefore;
    window.renameMenuCategory = renameMenuCategory;
    window.setAdminMenuSearch = setAdminMenuSearch;
    window.setAdminMenuFilter = setAdminMenuFilter;
    window.setStoreOpen = setStoreOpen;
    window.saveStoreSchedule = saveStoreSchedule;
    window.toggleMenuItemSoldOut = toggleMenuItemSoldOut;
    window.addAdminOptionRow = addAdminOptionRow;
    window.handleMenuCategoryChange = handleMenuCategoryChange;
    window.toggleMealBuildMode = toggleMealBuildMode;
    window.addMealItemRow = addMealItemRow;
    window.updateMealPriceSummary = updateMealPriceSummary;
    window.addAdminAddonGroup = addAdminAddonGroup;
    window.addAdminAddonOption = addAdminAddonOption;
    window.syncAddonGroupLimits = syncAddonGroupLimits;
    window.applyMealTemplate = applyMealTemplate;
    window.openItemCustomization = openItemCustomization;
    window.quickAddToCart = quickAddToCart;
    window.updateCustomizationTotal = updateCustomizationTotal;
    window.handleAddonSelection = handleAddonSelection;
    window.changeCustomizationQuantity = changeCustomizationQuantity;
    window.confirmCustomizedItem = confirmCustomizedItem;
    // Inline controls such as the fulfilment selector execute in the page's
    // global scope, while this application runs as an ES module. Expose the
    // shared cart renderer so those controls and module event handlers use the
    // same implementation after every cart rerender.
    window.renderCart = renderCart;
    window.alterQtyByIndex = alterQtyByIndex;
    window.editMenuItem = editMenuItem;
    window.toggleMenuItemVisibility = toggleMenuItemVisibility;
    window.removeMenuItem = removeMenuItem;
    window.resetFormState = resetFormState;
    window.changeMenuSorting = changeMenuSorting;
    window.updateOrderStatus = updateOrderStatus;
    window.acceptOrder = acceptOrder;
    window.rejectOrder = rejectOrder;
    window.markOrderReady = markOrderReady;
    window.completeKitchenOrder = completeKitchenOrder;
    window.setCustomerMenuFilter = setCustomerMenuFilter;
    window.scrollToMenuCategory = scrollToMenuCategory;
    window.cancelPendingOrder = cancelPendingOrder;
    window.orderAgain = orderAgain;
    window.renderOrdersTable = renderOrdersTable;
    window.handleOrderReportFilterChange = handleOrderReportFilterChange;
    window.changeOrderReportPage = changeOrderReportPage;
    window.exportOrdersCsv = exportOrdersCsv;
    window.requestOrderNotifications = requestOrderNotifications;
    window.startItemDrag = startItemDrag;
    window.dropItemBefore = dropItemBefore;
    window.saveMenuOrder = saveMenuOrder;
    window.duplicateMenuItem = duplicateMenuItem;
    