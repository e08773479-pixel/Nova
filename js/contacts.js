(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const APP = window.APP || {};

  const API_BASE =
    typeof APP.getApiURL === "function"
      ? APP.getApiURL("")
      : "/api/v1";

  const state = {
    initialized: false,
    contacts: [],
    searchQuery: "",
    filter: "all",
    loading: false,
    selected: new Set()
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  async function request(path, options = {}) {
    const url =
      path.startsWith("http")
        ? path
        : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, CONFIG.api?.timeout || 15000);

    try {
      const response = await fetch(url, {
        credentials: CONFIG.api?.credentials || "include",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body &&
          !(options.body instanceof FormData)
            ? {
                "Content-Type": "application/json"
              }
            : {}),
          ...(options.headers || {})
        },
        ...options
      });

      const contentType =
        response.headers.get("content-type") || "";

      let data = null;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text ? { message: text } : null;
      }

      if (!response.ok) {
        const error = new Error(
          data?.message ||
            data?.error ||
            "تعذر تنفيذ الطلب."
        );

        error.status = response.status;
        error.data = data;

        throw error;
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function notify(message, type = "info") {
    if (
      window.NOVA &&
      typeof window.NOVA.toast === "function"
    ) {
      window.NOVA.toast(message, type);
      return;
    }

    console.log(`[NOVA Contacts] ${message}`);
  }

  function normalizeContact(contact) {
    if (!contact) {
      return null;
    }

    return {
      id:
        contact.id ||
        contact.userId ||
        contact.contactId ||
        null,

      name:
        contact.name ||
        contact.displayName ||
        "",

      username:
        contact.username ||
        "",

      phone:
        contact.phone ||
        "",

      email:
        contact.email ||
        "",

      avatar:
        contact.avatar ||
        contact.photo ||
        "",

      about:
        contact.about ||
        "",

      online:
        Boolean(
          contact.online ??
          contact.isOnline
        ),

      verified:
        Boolean(
          contact.verified ??
          contact.isVerified
        ),

      blocked:
        Boolean(
          contact.blocked ??
          contact.isBlocked
        ),

      favorite:
        Boolean(
          contact.favorite ??
          contact.isFavorite
        ),

      muted:
        Boolean(
          contact.muted ??
          contact.isMuted
        ),

      lastSeen:
        contact.lastSeen ||
        null,

      raw: contact
    };
  }

  async function loadContacts() {
    if (state.loading) {
      return state.contacts;
    }

    state.loading = true;
    setLoading(true);

    try {
      const response = await request(
        "/contacts"
      );

      const contacts =
        response?.contacts ||
        response?.data ||
        [];

      state.contacts = contacts
        .map(normalizeContact)
        .filter(Boolean);

      render();

      return state.contacts;
    } catch (error) {
      notify(
        error.message ||
          "تعذر تحميل جهات الاتصال.",
        "error"
      );

      return [];
    } finally {
      state.loading = false;
      setLoading(false);
    }
  }

  async function searchContacts(query) {
    const cleanQuery =
      String(query || "").trim();

    state.searchQuery = cleanQuery;

    if (!cleanQuery) {
      render();
      return state.contacts;
    }

    try {
      const params = new URLSearchParams({
        q: cleanQuery
      });

      const response = await request(
        `/contacts/search?${params.toString()}`
      );

      const contacts =
        response?.contacts ||
        response?.data ||
        [];

      const results = contacts
        .map(normalizeContact)
        .filter(Boolean);

      render(results);

      return results;
    } catch (error) {
      /*
       * البحث المحلي لا يُستخدم كبديل
       * للبحث الحقيقي إلا على البيانات
       * التي تم تحميلها بالفعل من الخادم.
       */
      const localResults =
        state.contacts.filter((contact) =>
          [
            contact.name,
            contact.username,
            contact.phone,
            contact.email
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(
                  cleanQuery.toLowerCase()
                )
            )
        );

      render(localResults);

      return localResults;
    }
  }

  async function addContact(userId, data = {}) {
    if (!userId) {
      return null;
    }

    try {
      const response = await request(
        "/contacts",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            name: data.name || undefined
          })
        }
      );

      const contact = normalizeContact(
        response?.contact ||
          response?.data ||
          response
      );

      if (contact) {
        upsertContact(contact);
        render();
      }

      notify(
        "تمت إضافة جهة الاتصال.",
        "success"
      );

      return contact;
    } catch (error) {
      notify(
        error.message ||
          "تعذر إضافة جهة الاتصال.",
        "error"
      );

      return null;
    }
  }

  async function updateContact(
    contactId,
    data
  ) {
    if (!contactId || !data) {
      return null;
    }

    try {
      const response = await request(
        `/contacts/${encodeURIComponent(
          contactId
        )}`,
        {
          method: "PATCH",
          body: JSON.stringify(data)
        }
      );

      const contact = normalizeContact(
        response?.contact ||
          response?.data ||
          response
      );

      if (contact) {
        upsertContact(contact);
        render();
      }

      return contact;
    } catch (error) {
      notify(
        error.message ||
          "تعذر تحديث جهة الاتصال.",
        "error"
      );

      return null;
    }
  }

  async function removeContact(contactId) {
    if (!contactId) {
      return false;
    }

    try {
      await request(
        `/contacts/${encodeURIComponent(
          contactId
        )}`,
        {
          method: "DELETE"
        }
      );

      state.contacts =
        state.contacts.filter(
          (contact) =>
            String(contact.id) !==
            String(contactId)
        );

      state.selected.delete(
        contactId
      );

      render();

      notify(
        "تم حذف جهة الاتصال.",
        "success"
      );

      return true;
    } catch (error) {
      notify(
        error.message ||
          "تعذر حذف جهة الاتصال.",
        "error"
      );

      return false;
    }
  }

  async function toggleFavorite(
    contactId,
    favorite
  ) {
    return updateContact(
      contactId,
      {
        favorite: Boolean(favorite)
      }
    );
  }

  async function toggleMute(
    contactId,
    muted
  ) {
    return updateContact(
      contactId,
      {
        muted: Boolean(muted)
      }
    );
  }

  async function blockContact(
    contactId
  ) {
    if (!contactId) {
      return false;
    }

    try {
      await request(
        `/contacts/${encodeURIComponent(
          contactId
        )}/block`,
        {
          method: "POST"
        }
      );

      const contact =
        findContact(contactId);

      if (contact) {
        contact.blocked = true;
      }

      render();

      notify(
        "تم حظر جهة الاتصال.",
        "success"
      );

      return true;
    } catch (error) {
      notify(
        error.message ||
          "تعذر حظر جهة الاتصال.",
        "error"
      );

      return false;
    }
  }

  async function unblockContact(
    contactId
  ) {
    if (!contactId) {
      return false;
    }

    try {
      await request(
        `/contacts/${encodeURIComponent(
          contactId
        )}/block`,
        {
          method: "DELETE"
        }
      );

      const contact =
        findContact(contactId);

      if (contact) {
        contact.blocked = false;
      }

      render();

      notify(
        "تم إلغاء حظر جهة الاتصال.",
        "success"
      );

      return true;
    } catch (error) {
      notify(
        error.message ||
          "تعذر إلغاء الحظر.",
        "error"
      );

      return false;
    }
  }

  function findContact(contactId) {
    return state.contacts.find(
      (contact) =>
        String(contact.id) ===
        String(contactId)
    );
  }

  function upsertContact(contact) {
    if (!contact?.id) {
      return;
    }

    const index =
      state.contacts.findIndex(
        (item) =>
          String(item.id) ===
          String(contact.id)
      );

    if (index === -1) {
      state.contacts.push(contact);
    } else {
      state.contacts[index] = {
        ...state.contacts[index],
        ...contact
      };
    }
  }

  function setFilter(filter) {
    const allowed = [
      "all",
      "online",
      "favorites",
      "blocked"
    ];

    state.filter =
      allowed.includes(filter)
        ? filter
        : "all";

    qsa(
      "[data-contact-filter]"
    ).forEach((button) => {
      const active =
        button.dataset.contactFilter ===
        state.filter;

      button.classList.toggle(
        "is-active",
        active
      );

      button.setAttribute(
        "aria-selected",
        String(active)
      );
    });

    render();
  }

  function getFilteredContacts(
    source = state.contacts
  ) {
    let contacts = Array.isArray(source)
      ? [...source]
      : [];

    switch (state.filter) {
      case "online":
        contacts = contacts.filter(
          (contact) =>
            contact.online
        );
        break;

      case "favorites":
        contacts = contacts.filter(
          (contact) =>
            contact.favorite
        );
        break;

      case "blocked":
        contacts = contacts.filter(
          (contact) =>
            contact.blocked
        );
        break;

      default:
        break;
    }

    if (state.searchQuery) {
      const query =
        state.searchQuery.toLowerCase();

      contacts = contacts.filter(
        (contact) =>
          [
            contact.name,
            contact.username,
            contact.phone,
            contact.email
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(query)
            )
      );
    }

    return contacts.sort(
      (a, b) => {
        const nameA =
          a.name ||
          a.username ||
          "";

        const nameB =
          b.name ||
          b.username ||
          "";

        return nameA.localeCompare(
          nameB,
          "ar"
        );
      }
    );
  }

  function render(
    source = state.contacts
  ) {
    const containers = qsa(
      "[data-contacts-list]"
    );

    if (!containers.length) {
      return;
    }

    const contacts =
      getFilteredContacts(source);

    containers.forEach(
      (container) => {
        container.innerHTML = "";

        if (!contacts.length) {
          renderEmptyState(
            container
          );
          return;
        }

        contacts.forEach(
          (contact) => {
            container.appendChild(
              createContactElement(
                contact
              )
            );
          }
        );
      }
    );

    updateCounts();
  }

  function createContactElement(
    contact
  ) {
    const element =
      document.createElement("article");

    element.className =
      "nova-contact-item";

    element.dataset.contactId =
      contact.id || "";

    if (
      state.selected.has(
        contact.id
      )
    ) {
      element.classList.add(
        "is-selected"
      );
    }

    const displayName =
      contact.name ||
      contact.username ||
      "جهة اتصال";

    const avatar =
      contact.avatar;

    const status =
      contact.online
        ? "متصل الآن"
        : contact.lastSeen
        ? formatLastSeen(
            contact.lastSeen
          )
        : "";

    element.innerHTML = `
      <div class="nova-contact-item__select">
        <input
          type="checkbox"
          data-contact-select
          data-contact-id="${escapeHTML(
            contact.id
          )}"
          ${
            state.selected.has(
              contact.id
            )
              ? "checked"
              : ""
          }
          aria-label="تحديد ${escapeHTML(
            displayName
          )}"
        >
      </div>

      <div class="nova-contact-item__avatar">
        ${
          avatar
            ? `
              <img
                src="${escapeHTML(
                  avatar
                )}"
                alt=""
                loading="lazy"
              >
            `
            : `
              <span aria-hidden="true">
                ${escapeHTML(
                  getInitial(
                    displayName
                  )
                )}
              </span>
            `
        }

        ${
          contact.online
            ? `<i class="nova-contact-item__online" aria-hidden="true"></i>`
            : ""
        }
      </div>

      <div class="nova-contact-item__content">
        <div class="nova-contact-item__name">
          <strong>
            ${escapeHTML(
              displayName
            )}
          </strong>

          ${
            contact.verified
              ? `
                <span
                  class="nova-contact-item__verified"
                  title="حساب موثّق"
                  aria-label="حساب موثّق"
                >
                  ✓
                </span>
              `
              : ""
          }
        </div>

        ${
          contact.username
            ? `
              <div class="nova-contact-item__username">
                @${escapeHTML(
                  contact.username
                )}
              </div>
            `
            : ""
        }

        ${
          status
            ? `
              <div class="nova-contact-item__status">
                ${escapeHTML(
                  status
                )}
              </div>
            `
            : ""
        }
      </div>

      <div class="nova-contact-item__actions">

        ${
          contact.favorite
            ? `
              <button
                type="button"
                class="nova-contact-item__action is-favorite"
                data-contact-action="favorite"
                data-contact-id="${escapeHTML(
                  contact.id
                )}"
                aria-label="إزالة من المفضلة"
                title="إزالة من المفضلة"
              >
                ★
              </button>
            `
            : `
              <button
                type="button"
                class="nova-contact-item__action"
                data-contact-action="favorite"
                data-contact-id="${escapeHTML(
                  contact.id
                )}"
                aria-label="إضافة إلى المفضلة"
                title="إضافة إلى المفضلة"
              >
                ☆
              </button>
            `
        }

        <button
          type="button"
          class="nova-contact-item__action"
          data-contact-action="chat"
          data-contact-id="${escapeHTML(
            contact.id
          )}"
          aria-label="بدء محادثة"
          title="مراسلة"
        >
          💬
        </button>

        <button
          type="button"
          class="nova-contact-item__action"
          data-contact-action="menu"
          data-contact-id="${escapeHTML(
            contact.id
          )}"
          aria-label="المزيد"
          title="المزيد"
        >
          ⋮
        </button>

      </div>
    `;

    return element;
  }

  function renderEmptyState(
    container
  ) {
    const message =
      state.searchQuery
        ? "لا توجد نتائج مطابقة."
        : state.filter === "online"
        ? "لا توجد جهات اتصال متصلة الآن."
        : state.filter === "favorites"
        ? "لا توجد جهات اتصال في المفضلة."
        : state.filter === "blocked"
        ? "لا توجد جهات اتصال محظورة."
        : "لا توجد جهات اتصال لعرضها.";

    container.innerHTML = `
      <div class="nova-contacts-empty">
        <div class="nova-contacts-empty__icon">
          ◌
        </div>

        <h3>
          ${escapeHTML(
            message
          )}
        </h3>

        <p>
          ستظهر هنا جهات الاتصال المرتبطة بحسابك بعد تحميلها من الخادم.
        </p>
      </div>
    `;
  }

  function updateCounts() {
    const counts = {
      all: state.contacts.length,

      online:
        state.contacts.filter(
          (contact) =>
            contact.online
        ).length,

      favorites:
        state.contacts.filter(
          (contact) =>
            contact.favorite
        ).length,

      blocked:
        state.contacts.filter(
          (contact) =>
            contact.blocked
        ).length
    };

    qsa(
      "[data-contact-count]"
    ).forEach((element) => {
      const type =
        element.dataset.contactCount ||
        "all";

      element.textContent =
        String(
          counts[type] || 0
        );
    });
  }

  function getInitial(name) {
    return (
      String(name || "?")
        .trim()
        .charAt(0)
        .toUpperCase() || "?"
    );
  }

  function formatLastSeen(
    value
  ) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    return (
      "آخر ظهور " +
      new Intl.DateTimeFormat(
        CONFIG.app?.locale ||
          "ar-EG",
        {
          dateStyle: "medium",
          timeStyle: "short"
        }
      ).format(date)
    );
  }

  function setLoading(
    loading
  ) {
    qsa(
      "[data-contacts-loading]"
    ).forEach((element) => {
      element.hidden = !loading;
    });

    qsa(
      "[data-contacts-list]"
    ).forEach((element) => {
      element.setAttribute(
        "aria-busy",
        String(loading)
      );
    });
  }

  function toggleSelection(
    contactId
  ) {
    if (!contactId) {
      return;
    }

    if (
      state.selected.has(
        contactId
      )
    ) {
      state.selected.delete(
        contactId
      );
    } else {
      state.selected.add(
        contactId
      );
    }

    render();
    updateSelectionUI();
  }

  function clearSelection() {
    state.selected.clear();
    render();
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const count =
      state.selected.size;

    qsa(
      "[data-selected-contacts-count]"
    ).forEach((element) => {
      element.textContent =
        String(count);
    });

    qsa(
      "[data-selected-contacts-toolbar]"
    ).forEach((element) => {
      element.hidden =
        count === 0;
    });
  }

  async function openChat(
    contactId
  ) {
    if (!contactId) {
      return;
    }

    try {
      const response =
        await request(
          "/conversations",
          {
            method: "POST",
            body: JSON.stringify({
              participantId:
                contactId
            })
          }
        );

      const conversation =
        response?.conversation ||
        response?.data ||
        response;

      const id =
        conversation?.id ||
        conversation?.conversationId;

      if (!id) {
        throw new Error(
          "تعذر إنشاء المحادثة."
        );
      }

      const target =
        typeof APP.getRoute ===
        "function"
          ? APP.getRoute(
              "pages.chat"
            )
          : "./pages/chat.html";

      const separator =
        target.includes("?")
          ? "&"
          : "?";

      window.location.assign(
        `${target}${separator}conversation=${encodeURIComponent(
          id
        )}`
      );
    } catch (error) {
      notify(
        error.message ||
          "تعذر فتح المحادثة.",
        "error"
      );
    }
  }

  function bindSearch() {
    const inputs = qsa(
      "[data-contacts-search]"
    );

    inputs.forEach((input) => {
      input.addEventListener(
        "input",
        debounce(
          (event) => {
            searchContacts(
              event.target.value
            );
          },
          300
        )
      );
    });
  }

  function bindFilters() {
    qsa(
      "[data-contact-filter]"
    ).forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setFilter(
            button.dataset
              .contactFilter
          );
        }
      );
    });
  }

  function bindActions() {
    document.addEventListener(
      "change",
      (event) => {
        const checkbox =
          event.target.closest(
            "[data-contact-select]"
          );

        if (!checkbox) {
          return;
        }

        toggleSelection(
          checkbox.dataset
            .contactId
        );
      }
    );

    document.addEventListener(
      "click",
      async (event) => {
        const action =
          event.target.closest(
            "[data-contact-action]"
          );

        if (!action) {
          return;
        }

        const contactId =
          action.dataset.contactId;

        const type =
          action.dataset.contactAction;

        const contact =
          findContact(
            contactId
          );

        if (!contact) {
          return;
        }

        switch (type) {
          case "favorite":
            await toggleFavorite(
              contactId,
              !contact.favorite
            );
            break;

          case "chat":
            await openChat(
              contactId
            );
            break;

          case "menu":
            openContactMenu(
              contact
            );
            break;

          default:
            break;
        }
      }
    );

    qsa(
      "[data-contacts-reload]"
    ).forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          loadContacts();
        }
      );
    });

    qsa(
      "[data-contacts-clear-selection]"
    ).forEach((button) => {
      button.addEventListener(
        "click",
        clearSelection
      );
    });
  }

  function openContactMenu(
    contact
  ) {
    const menu =
      qs("[data-contact-menu]");

    if (!menu) {
      return;
    }

    menu.dataset.contactId =
      contact.id;

    qsa(
      "[data-contact-menu-name]"
    ).forEach((element) => {
      element.textContent =
        contact.name ||
        contact.username ||
        "جهة اتصال";
    });

    qsa(
      "[data-contact-menu-favorite]"
    ).forEach((element) => {
      element.textContent =
        contact.favorite
          ? "إزالة من المفضلة"
          : "إضافة إلى المفضلة";
    });

    qsa(
      "[data-contact-menu-block]"
    ).forEach((element) => {
      element.textContent =
        contact.blocked
          ? "إلغاء الحظر"
          : "حظر جهة الاتصال";
    });

    menu.hidden = false;
  }

  function bindContactMenu() {
    document.addEventListener(
      "click",
      async (event) => {
        const action =
          event.target.closest(
            "[data-contact-menu-action]"
          );

        if (!action) {
          return;
        }

        const menu =
          qs("[data-contact-menu]");

        const contactId =
          action.dataset.contactId ||
          menu?.dataset.contactId;

        const contact =
          findContact(
            contactId
          );

        if (!contact) {
          return;
        }

        const type =
          action.dataset
            .contactMenuAction;

        if (
          type === "favorite"
        ) {
          await toggleFavorite(
            contactId,
            !contact.favorite
          );
        }

        if (
          type === "block"
        ) {
          if (
            contact.blocked
          ) {
            await unblockContact(
              contactId
            );
          } else {
            await blockContact(
              contactId
            );
          }
        }

        if (
          type === "delete"
        ) {
          await removeContact(
            contactId
          );
        }

        if (
          type === "chat"
        ) {
          await openChat(
            contactId
          );
        }

        if (menu) {
          menu.hidden = true;
        }
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        const menu =
          qs("[data-contact-menu]");

        if (
          !menu ||
          menu.hidden
        ) {
          return;
        }

        if (
          !event.target.closest(
            "[data-contact-menu]"
          )
        ) {
          menu.hidden = true;
        }
      }
    );
  }

  function debounce(
    callback,
    delay
  ) {
    let timer = null;

    return (...args) => {
      clearTimeout(timer);

      timer = setTimeout(
        () => {
          callback(...args);
        },
        delay
      );
    };
  }

  function init() {
    if (state.initialized) {
      return;
    }

    if (
      !document.querySelector(
        "[data-contacts-page]"
      )
    ) {
      return;
    }

    state.initialized = true;

    bindSearch();
    bindFilters();
    bindActions();
    bindContactMenu();

    loadContacts();

    document.dispatchEvent(
      new CustomEvent(
        "nova:contacts:ready"
      )
    );
  }

  window.NOVA_CONTACTS = {
    state,

    init,

    loadContacts,
    searchContacts,

    addContact,
    updateContact,
    removeContact,

    toggleFavorite,
    toggleMute,

    blockContact,
    unblockContact,

    findContact,

    setFilter,

    toggleSelection,
    clearSelection,

    openChat,

    getContacts() {
      return [
        ...state.contacts
      ];
    },

    getSelectedContacts() {
      return Array.from(
        state.selected
      );
    }
  };

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();
