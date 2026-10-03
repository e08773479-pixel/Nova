/* =========================================================
   NOVA — Groups Engine
   File: js/groups.js
   Version: 1.0.0

   المسؤول عن:
   - إنشاء المجموعات
   - تحميل المجموعات
   - تحميل بيانات مجموعة محددة
   - الأعضاء
   - إضافة / إزالة أعضاء
   - ترقية / خفض صلاحيات المشرفين
   - صلاحيات المجموعة
   - رابط الدعوة
   - الانضمام بالرابط
   - مغادرة المجموعة
   - حذف المجموعة
   - تحديث بيانات المجموعة
   - رفع صورة المجموعة
   - عدم إنشاء أي بيانات وهمية
   ========================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const APP = window.APP || {};

  const API_BASE =
    String(CONFIG.api?.baseURL || "/api")
      .replace(/\/+$/g, "");

  const API_VERSION =
    String(CONFIG.api?.version || "v1")
      .replace(/^\/+|\/+$/g, "");

  const GROUPS_ENDPOINT =
    `${API_BASE}/${API_VERSION}/groups`;

  const UPLOAD_ENDPOINT =
    `${API_BASE}/${API_VERSION}/uploads`;

  const state = {
    initialized: false,

    loading: false,
    creating: false,

    groups: [],
    currentGroup: null,
    currentMembers: [],

    selectedGroupId: null,

    selectedImage: null,
    selectedImageURL: null,

    permissions: null,

    pagination: {
      page: 1,
      limit: 30,
      hasMore: false
    }
  };

  /* =========================================================
     Helpers
     ========================================================= */

  function jsonHeaders() {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
  }

  function authHeaders() {
    return {
      "Accept": "application/json"
    };
  }

  async function request(
    url,
    options = {}
  ) {
    const config = {
      method:
        options.method || "GET",

      credentials:
        CONFIG.api?.credentials === "include"
          ? "include"
          : "same-origin",

      headers: {
        ...authHeaders(),
        ...(options.headers || {})
      }
    };

    if (
      options.body !== undefined
    ) {
      config.body =
        options.body;
    }

    const response =
      await fetch(
        url,
        config
      );

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let data = null;

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      try {
        data =
          await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        const text =
          await response.text();

        data =
          text
            ? { message: text }
            : null;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const error =
        new Error(
          data?.message ||
          data?.error ||
          `HTTP ${response.status}`
        );

      error.status =
        response.status;

      error.data = data;

      throw error;
    }

    return data;
  }

  function emit(
    event,
    detail = {}
  ) {
    document.dispatchEvent(
      new CustomEvent(
        `nova:groups:${event}`,
        {
          detail
        }
      )
    );
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeURL(value) {
    if (!value) {
      return "";
    }

    try {
      const url =
        new URL(
          value,
          window.location.origin
        );

      if (
        url.protocol === "http:" ||
        url.protocol === "https:" ||
        url.protocol === "blob:"
      ) {
        return url.href;
      }

      return "";
    } catch {
      return "";
    }
  }

  function groupId(group) {
    return (
      group?.id ??
      group?._id ??
      group?.groupId ??
      ""
    );
  }

  function userId(user) {
    return (
      user?.id ??
      user?._id ??
      user?.userId ??
      ""
    );
  }

  function currentUser() {
    try {
      if (
        typeof window.NOVA_AUTH
          ?.getCurrentUser ===
        "function"
      ) {
        return window.NOVA_AUTH
          .getCurrentUser();
      }

      if (
        typeof APP.getCurrentUser ===
        "function"
      ) {
        return APP.getCurrentUser();
      }
    } catch {
      // لا نكسر التطبيق.
    }

    return null;
  }

  function currentUserId() {
    return userId(
      currentUser()
    );
  }

  function getGroupName(group) {
    return (
      group?.name ||
      group?.title ||
      "مجموعة"
    );
  }

  function getGroupDescription(
    group
  ) {
    return (
      group?.description ||
      group?.about ||
      ""
    );
  }

  function getGroupAvatar(group) {
    return safeURL(
      group?.avatar ||
      group?.avatarUrl ||
      group?.photo ||
      group?.image ||
      ""
    );
  }

  function getMembers(group) {
    if (
      Array.isArray(
        group?.members
      )
    ) {
      return group.members;
    }

    if (
      Array.isArray(
        group?.participants
      )
    ) {
      return group.participants;
    }

    return [];
  }

  function normalizeGroups(data) {
    if (
      Array.isArray(data)
    ) {
      return data;
    }

    if (
      Array.isArray(
        data?.groups
      )
    ) {
      return data.groups;
    }

    if (
      Array.isArray(
        data?.data
      )
    ) {
      return data.data;
    }

    return [];
  }

  function normalizeMembers(data) {
    if (
      Array.isArray(data)
    ) {
      return data;
    }

    if (
      Array.isArray(
        data?.members
      )
    ) {
      return data.members;
    }

    if (
      Array.isArray(
        data?.participants
      )
    ) {
      return data.participants;
    }

    if (
      Array.isArray(
        data?.data
      )
    ) {
      return data.data;
    }

    return [];
  }

  /* =========================================================
     Groups
     ========================================================= */

  async function fetchGroups(
    options = {}
  ) {
    if (
      state.loading &&
      !options.force
    ) {
      return {
        success: false,
        groups: []
      };
    }

    state.loading = true;

    const page =
      Number(
        options.page ||
        state.pagination.page
      );

    const limit =
      Number(
        options.limit ||
        state.pagination.limit
      );

    try {
      const params =
        new URLSearchParams();

      params.set(
        "page",
        String(page)
      );

      params.set(
        "limit",
        String(limit)
      );

      if (
        options.search
      ) {
        params.set(
          "search",
          String(
            options.search
          )
        );
      }

      const data =
        await request(
          `${GROUPS_ENDPOINT}?${params}`,
          {
            method: "GET"
          }
        );

      const groups =
        normalizeGroups(
          data
        );

      if (
        page === 1
      ) {
        state.groups =
          groups;
      } else {
        state.groups =
          [
            ...state.groups,
            ...groups
          ];
      }

      state.pagination.page =
        page;

      state.pagination.hasMore =
        Boolean(
          data?.pagination
            ?.hasMore ??
          data?.meta?.hasMore ??
          false
        );

      emit(
        "loaded",
        {
          groups,
          page
        }
      );

      return {
        success: true,
        groups,
        pagination:
          data?.pagination ||
          data?.meta ||
          null
      };

    } catch (error) {
      console.error(
        "[NOVA GROUPS] Load failed:",
        error
      );

      emit(
        "error",
        {
          operation: "load",
          error
        }
      );

      return {
        success: false,
        groups: [],
        error
      };
    } finally {
      state.loading = false;
    }
  }

  async function loadMoreGroups() {
    if (
      state.loading ||
      !state.pagination.hasMore
    ) {
      return {
        success: false
      };
    }

    return fetchGroups({
      page:
        state.pagination.page + 1
    });
  }

  async function fetchGroup(
    id
  ) {
    if (!id) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const encodedId =
      encodeURIComponent(
        String(id)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${encodedId}`,
        {
          method: "GET"
        }
      );

    const group =
      data?.group ||
      data?.data ||
      data;

    state.currentGroup =
      group;

    state.selectedGroupId =
      id;

    state.currentMembers =
      normalizeMembers(
        group?.members ||
        group?.participants ||
        []
      );

    emit(
      "opened",
      {
        group
      }
    );

    return {
      success: true,
      group
    };
  }

  async function createGroup(
    payload = {}
  ) {
    const name =
      String(
        payload.name ||
        payload.title ||
        ""
      ).trim();

    if (!name) {
      throw new Error(
        "اسم المجموعة مطلوب."
      );
    }

    state.creating = true;

    try {
      const body = {
        name,

        description:
          String(
            payload.description ||
            ""
          ).trim(),

        privacy:
          payload.privacy ||
          "private"
      };

      if (
        Array.isArray(
          payload.memberIds
        ) &&
        payload.memberIds.length
      ) {
        body.memberIds =
          payload.memberIds
            .filter(Boolean);
      }

      if (
        payload.avatarId
      ) {
        body.avatarId =
          payload.avatarId;
      }

      const data =
        await request(
          GROUPS_ENDPOINT,
          {
            method: "POST",
            headers:
              jsonHeaders(),
            body:
              JSON.stringify(
                body
              )
          }
        );

      const group =
        data?.group ||
        data?.data ||
        data;

      if (group) {
        state.groups =
          [
            group,
            ...state.groups
          ];
      }

      emit(
        "created",
        {
          group
        }
      );

      return {
        success: true,
        group
      };

    } catch (error) {
      emit(
        "error",
        {
          operation: "create",
          error
        }
      );

      throw error;

    } finally {
      state.creating = false;
    }
  }

  /* =========================================================
     Update Group
     ========================================================= */

  async function updateGroup(
    id,
    updates = {}
  ) {
    if (!id) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const encodedId =
      encodeURIComponent(
        String(id)
      );

    const body = {};

    if (
      updates.name !== undefined
    ) {
      body.name =
        String(
          updates.name
        ).trim();
    }

    if (
      updates.description !==
      undefined
    ) {
      body.description =
        String(
          updates.description
        ).trim();
    }

    if (
      updates.privacy !==
      undefined
    ) {
      body.privacy =
        updates.privacy;
    }

    if (
      updates.avatarId
    ) {
      body.avatarId =
        updates.avatarId;
    }

    if (
      updates.permissions
    ) {
      body.permissions =
        updates.permissions;
    }

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${encodedId}`,
        {
          method: "PATCH",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify(
              body
            )
        }
      );

    const updatedGroup =
      data?.group ||
      data?.data ||
      data;

    state.currentGroup =
      updatedGroup;

    state.groups =
      state.groups.map(
        (group) =>
          String(
            groupId(group)
          ) === String(id)
            ? updatedGroup
            : group
      );

    emit(
      "updated",
      {
        group:
          updatedGroup
      }
    );

    return {
      success: true,
      group:
        updatedGroup
    };
  }

  /* =========================================================
     Members
     ========================================================= */

  async function fetchMembers(
    groupIdValue,
    options = {}
  ) {
    if (!groupIdValue) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const encodedId =
      encodeURIComponent(
        String(groupIdValue)
      );

    const params =
      new URLSearchParams();

    if (options.page) {
      params.set(
        "page",
        String(options.page)
      );
    }

    if (options.limit) {
      params.set(
        "limit",
        String(options.limit)
      );
    }

    const query =
      params.toString();

    const url =
      `${GROUPS_ENDPOINT}/${encodedId}/members` +
      (query ? `?${query}` : "");

    const data =
      await request(
        url,
        {
          method: "GET"
        }
      );

    const members =
      normalizeMembers(
        data
      );

    state.currentMembers =
      members;

    if (
      state.currentGroup &&
      String(
        groupId(
          state.currentGroup
        )
      ) ===
      String(groupIdValue)
    ) {
      state.currentGroup.members =
        members;
    }

    emit(
      "membersLoaded",
      {
        groupId:
          groupIdValue,
        members
      }
    );

    return {
      success: true,
      members
    };
  }

  async function addMember(
    groupIdValue,
    memberId
  ) {
    if (
      !groupIdValue ||
      !memberId
    ) {
      throw new Error(
        "بيانات العضو غير مكتملة."
      );
    }

    const id =
      encodeURIComponent(
        String(groupIdValue)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${id}/members`,
        {
          method: "POST",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify({
              userId:
                memberId
            })
        }
      );

    emit(
      "memberAdded",
      {
        groupId:
          groupIdValue,
        memberId,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  async function removeMember(
    groupIdValue,
    memberId
  ) {
    if (
      !groupIdValue ||
      !memberId
    ) {
      throw new Error(
        "بيانات العضو غير مكتملة."
      );
    }

    const group =
      encodeURIComponent(
        String(groupIdValue)
      );

    const member =
      encodeURIComponent(
        String(memberId)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${group}/members/${member}`,
        {
          method: "DELETE"
        }
      );

    state.currentMembers =
      state.currentMembers.filter(
        (item) =>
          String(
            userId(item)
          ) !==
          String(memberId)
      );

    emit(
      "memberRemoved",
      {
        groupId:
          groupIdValue,
        memberId,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  /* =========================================================
     Admin Roles
     ========================================================= */

  async function promoteMember(
    groupIdValue,
    memberId
  ) {
    return updateMemberRole(
      groupIdValue,
      memberId,
      "admin"
    );
  }

  async function demoteMember(
    groupIdValue,
    memberId
  ) {
    return updateMemberRole(
      groupIdValue,
      memberId,
      "member"
    );
  }

  async function updateMemberRole(
    groupIdValue,
    memberId,
    role
  ) {
    if (
      !groupIdValue ||
      !memberId
    ) {
      throw new Error(
        "بيانات العضو غير مكتملة."
      );
    }

    const group =
      encodeURIComponent(
        String(groupIdValue)
      );

    const member =
      encodeURIComponent(
        String(memberId)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${group}/members/${member}/role`,
        {
          method: "PATCH",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify({
              role
            })
        }
      );

    state.currentMembers =
      state.currentMembers.map(
        (item) =>
          String(
            userId(item)
          ) ===
          String(memberId)
            ? {
                ...item,
                role
              }
            : item
      );

    emit(
      "roleChanged",
      {
        groupId:
          groupIdValue,
        memberId,
        role,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  /* =========================================================
     Permissions
     ========================================================= */

  async function fetchPermissions(
    groupIdValue
  ) {
    if (!groupIdValue) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const id =
      encodeURIComponent(
        String(groupIdValue)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${id}/permissions`,
        {
          method: "GET"
        }
      );

    const permissions =
      data?.permissions ||
      data?.data ||
      data;

    state.permissions =
      permissions;

    emit(
      "permissionsLoaded",
      {
        groupId:
          groupIdValue,
        permissions
      }
    );

    return {
      success: true,
      permissions
    };
  }

  async function updatePermissions(
    groupIdValue,
    permissions
  ) {
    if (!groupIdValue) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    if (
      !permissions ||
      typeof permissions !==
      "object"
    ) {
      throw new Error(
        "بيانات الصلاحيات غير صحيحة."
      );
    }

    const id =
      encodeURIComponent(
        String(groupIdValue)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${id}/permissions`,
        {
          method: "PATCH",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify({
              permissions
            })
        }
      );

    state.permissions =
      data?.permissions ||
      data?.data ||
      permissions;

    emit(
      "permissionsUpdated",
      {
        groupId:
          groupIdValue,
        permissions:
          state.permissions,
        data
      }
    );

    return {
      success: true,
      permissions:
        state.permissions
    };
  }

  /* =========================================================
     Invite Links
     ========================================================= */

  async function createInviteLink(
    groupIdValue,
    options = {}
  ) {
    if (!groupIdValue) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const id =
      encodeURIComponent(
        String(groupIdValue)
      );

    const body = {};

    if (
      options.expiresAt
    ) {
      body.expiresAt =
        options.expiresAt;
    }

    if (
      options.maxUses !==
      undefined
    ) {
      body.maxUses =
        Number(
          options.maxUses
        );
    }

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${id}/invite-links`,
        {
          method: "POST",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify(
              body
            )
        }
      );

    const invite =
      data?.invite ||
      data?.inviteLink ||
      data?.data ||
      data;

    emit(
      "inviteCreated",
      {
        groupId:
          groupIdValue,
        invite
      }
    );

    return {
      success: true,
      invite
    };
  }

  async function revokeInviteLink(
    groupIdValue,
    inviteId
  ) {
    if (
      !groupIdValue ||
      !inviteId
    ) {
      throw new Error(
        "بيانات رابط الدعوة غير مكتملة."
      );
    }

    const group =
      encodeURIComponent(
        String(groupIdValue)
      );

    const invite =
      encodeURIComponent(
        String(inviteId)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${group}/invite-links/${invite}`,
        {
          method: "DELETE"
        }
      );

    emit(
      "inviteRevoked",
      {
        groupId:
          groupIdValue,
        inviteId,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  async function joinByInvite(
    token
  ) {
    const cleanToken =
      String(
        token || ""
      ).trim();

    if (!cleanToken) {
      throw new Error(
        "رابط الدعوة غير صالح."
      );
    }

    const data =
      await request(
        `${GROUPS_ENDPOINT}/join`,
        {
          method: "POST",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify({
              token:
                cleanToken
            })
        }
      );

    const group =
      data?.group ||
      data?.data ||
      null;

    if (group) {
      const id =
        groupId(group);

      state.groups =
        [
          group,
          ...state.groups.filter(
            (item) =>
              String(
                groupId(item)
              ) !==
              String(id)
          )
        ];
    }

    emit(
      "joined",
      {
        group,
        data
      }
    );

    return {
      success: true,
      group,
      data
    };
  }

  /* =========================================================
     Leave / Delete
     ========================================================= */

  async function leaveGroup(
    groupIdValue
  ) {
    if (!groupIdValue) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const id =
      encodeURIComponent(
        String(groupIdValue)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${id}/leave`,
        {
          method: "POST",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify({})
        }
      );

    state.groups =
      state.groups.filter(
        (group) =>
          String(
            groupId(group)
          ) !==
          String(groupIdValue)
      );

    if (
      state.currentGroup &&
      String(
        groupId(
          state.currentGroup
        )
      ) ===
      String(groupIdValue)
    ) {
      state.currentGroup = null;
      state.currentMembers = [];
      state.selectedGroupId = null;
    }

    emit(
      "left",
      {
        groupId:
          groupIdValue,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  async function deleteGroup(
    groupIdValue
  ) {
    if (!groupIdValue) {
      throw new Error(
        "معرّف المجموعة غير موجود."
      );
    }

    const confirmed =
      window.confirm(
        "هل تريد حذف المجموعة نهائيًا؟"
      );

    if (!confirmed) {
      return {
        success: false,
        cancelled: true
      };
    }

    const id =
      encodeURIComponent(
        String(groupIdValue)
      );

    const data =
      await request(
        `${GROUPS_ENDPOINT}/${id}`,
        {
          method: "DELETE"
        }
      );

    state.groups =
      state.groups.filter(
        (group) =>
          String(
            groupId(group)
          ) !==
          String(groupIdValue)
      );

    if (
      state.currentGroup &&
      String(
        groupId(
          state.currentGroup
        )
      ) ===
      String(groupIdValue)
    ) {
      state.currentGroup = null;
      state.currentMembers = [];
      state.selectedGroupId = null;
    }

    emit(
      "deleted",
      {
        groupId:
          groupIdValue,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  /* =========================================================
     Group Image
     ========================================================= */

  function validateGroupImage(
    file
  ) {
    if (!file) {
      return {
        valid: false,
        message:
          "اختر صورة أولًا."
      };
    }

    const allowed =
      CONFIG.uploads
        ?.allowedImages ||
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
      ];

    if (
      !allowed.includes(
        file.type
      )
    ) {
      return {
        valid: false,
        message:
          "نوع الصورة غير مدعوم."
      };
    }

    const maxMB =
      Number(
        CONFIG.uploads
          ?.maxImageSizeMB
      ) || 10;

    if (
      file.size >
      maxMB * 1024 * 1024
    ) {
      return {
        valid: false,
        message:
          `حجم الصورة يتجاوز ${maxMB}MB.`
      };
    }

    return {
      valid: true
    };
  }

  async function uploadGroupImage(
    file
  ) {
    const validation =
      validateGroupImage(
        file
      );

    if (!validation.valid) {
      throw new Error(
        validation.message
      );
    }

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    formData.append(
      "purpose",
      "group-avatar"
    );

    const data =
      await request(
        UPLOAD_ENDPOINT,
        {
          method: "POST",
          body:
            formData
        }
      );

    const uploaded =
      data?.file ||
      data?.media ||
      data?.data ||
      data;

    return {
      success: true,
      upload:
        uploaded
    };
  }

  function selectGroupImage(
    file
  ) {
    const validation =
      validateGroupImage(
        file
      );

    if (!validation.valid) {
      clearGroupImage();
      throw new Error(
        validation.message
      );
    }

    clearGroupImage();

    state.selectedImage =
      file;

    state.selectedImageURL =
      URL.createObjectURL(
        file
      );

    renderImagePreview();

    emit(
      "imageSelected",
      {
        file,
        preview:
          state.selectedImageURL
      }
    );

    return {
      success: true,
      file,
      preview:
        state.selectedImageURL
    };
  }

  function clearGroupImage() {
    if (
      state.selectedImageURL
    ) {
      try {
        URL.revokeObjectURL(
          state.selectedImageURL
        );
      } catch {
        // Ignore.
      }
    }

    state.selectedImage = null;
    state.selectedImageURL = null;

    const preview =
      document.querySelector(
        "[data-group-image-preview]"
      );

    if (preview) {
      preview.innerHTML = "";
      preview.hidden = true;
    }
  }

  function renderImagePreview() {
    const preview =
      document.querySelector(
        "[data-group-image-preview]"
      );

    if (!preview) {
      return;
    }

    if (
      !state.selectedImageURL
    ) {
      preview.innerHTML = "";
      preview.hidden = true;
      return;
    }

    preview.innerHTML = `
      <img
        src="${escapeHTML(
          state.selectedImageURL
        )}"
        alt="معاينة صورة المجموعة"
      >
    `;

    preview.hidden = false;
  }

  /* =========================================================
     Create Form
     ========================================================= */

  function bindCreateForm() {
    const form =
      document.querySelector(
        "[data-group-create-form]"
      );

    if (!form) {
      return;
    }

    const nameInput =
      form.querySelector(
        "[data-group-name]"
      );

    const descriptionInput =
      form.querySelector(
        "[data-group-description]"
      );

    const privacyInput =
      form.querySelector(
        "[data-group-privacy]"
      );

    const imageInput =
      form.querySelector(
        "[data-group-image]"
      );

    if (imageInput) {
      imageInput.addEventListener(
        "change",
        () => {
          const file =
            imageInput.files?.[0];

          if (!file) {
            clearGroupImage();
            return;
          }

          try {
            selectGroupImage(
              file
            );
          } catch (error) {
            imageInput.value =
              "";
            showError(
              error.message
            );
          }
        }
      );
    }

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (
          state.creating
        ) {
          return;
        }

        try {
          let avatarId =
            null;

          if (
            state.selectedImage
          ) {
            const upload =
              await uploadGroupImage(
                state.selectedImage
              );

            const uploaded =
              upload.upload;

            avatarId =
              uploaded?.id ??
              uploaded?._id ??
              null;
          }

          await createGroup({
            name:
              nameInput?.value ||
              "",

            description:
              descriptionInput
                ?.value || "",

            privacy:
              privacyInput
                ?.value ||
              "private",

            avatarId
          });

          form.reset();
          clearGroupImage();

          renderGroups(
            document.querySelector(
              "[data-groups-list]"
            ),
            state.groups
          );

        } catch (error) {
          console.error(
            "[NOVA GROUPS] Create failed:",
            error
          );

          showError(
            error.message ||
            "تعذر إنشاء المجموعة."
          );
        }
      }
    );
  }

  /* =========================================================
     Rendering
     ========================================================= */

  function renderGroups(
    container,
    groups = state.groups
  ) {
    if (!container) {
      return;
    }

    if (
      !Array.isArray(groups) ||
      groups.length === 0
    ) {
      container.innerHTML = `
        <div class="nova-groups-empty">
          <div class="nova-groups-empty-icon">
            ◌
          </div>

          <strong>
            لا توجد مجموعات متاحة
          </strong>

          <span>
            أنشئ مجموعة جديدة أو انضم إلى مجموعة باستخدام رابط دعوة.
          </span>
        </div>
      `;

      return;
    }

    container.innerHTML =
      groups
        .map(
          (group) =>
            renderGroupItem(
              group
            )
        )
        .join("");

    bindGroupItems(
      container
    );
  }

  function renderGroupItem(
    group
  ) {
    const id =
      escapeHTML(
        groupId(group)
      );

    const name =
      escapeHTML(
        getGroupName(group)
      );

    const description =
      escapeHTML(
        getGroupDescription(
          group
        )
      );

    const avatar =
      getGroupAvatar(group);

    const avatarMarkup =
      avatar
        ? `
          <img
            src="${escapeHTML(avatar)}"
            alt="${name}"
            loading="lazy"
          >
        `
        : `
          <span>
            ${escapeHTML(
              getGroupName(
                group
              ).charAt(0)
            )}
          </span>
        `;

    return `
      <article
        class="nova-group-item"
        data-group-item
        data-group-id="${id}"
      >
        <button
          type="button"
          data-group-open
          data-group-id="${id}"
          class="nova-group-open"
        >
          <span class="nova-group-avatar">
            ${avatarMarkup}
          </span>

          <span class="nova-group-content">
            <strong>
              ${name}
            </strong>

            ${
              description
                ? `
                  <small>
                    ${description}
                  </small>
                `
                : ""
            }
          </span>
        </button>
      </article>
    `;
  }

  function bindGroupItems(
    container
  ) {
    container
      .querySelectorAll(
        "[data-group-open]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async () => {
              const id =
                button.dataset
                  .groupId;

              try {
                await fetchGroup(
                  id
                );

                emit(
                  "navigate",
                  {
                    groupId: id
                  }
                );

              } catch (error) {
                showError(
                  error.message ||
                  "تعذر فتح المجموعة."
                );
              }
            }
          );
        }
      );
  }

  function renderMembers(
    container,
    members = state.currentMembers
  ) {
    if (!container) {
      return;
    }

    if (
      !Array.isArray(members) ||
      members.length === 0
    ) {
      container.innerHTML = `
        <div class="nova-members-empty">
          لا يوجد أعضاء لعرضهم.
        </div>
      `;

      return;
    }

    container.innerHTML =
      members
        .map(
          (member) =>
            renderMember(
              member
            )
        )
        .join("");
  }

  function renderMember(
    member
  ) {
    const id =
      escapeHTML(
        userId(member)
      );

    const name =
      escapeHTML(
        member?.name ||
        member?.displayName ||
        "مستخدم"
      );

    const avatar =
      safeURL(
        member?.avatar ||
        member?.avatarUrl ||
        member?.photo ||
        ""
      );

    const role =
      String(
        member?.role ||
        "member"
      );

    const roleLabel =
      role === "owner"
        ? "المالك"
        : role === "admin"
          ? "مشرف"
          : "عضو";

    const avatarMarkup =
      avatar
        ? `
          <img
            src="${escapeHTML(avatar)}"
            alt="${name}"
            loading="lazy"
          >
        `
        : `
          <span>
            ${escapeHTML(
              name.charAt(0)
            )}
          </span>
        `;

    return `
      <article
        class="nova-group-member"
        data-member-id="${id}"
      >
        <span class="nova-member-avatar">
          ${avatarMarkup}
        </span>

        <span class="nova-member-info">
          <strong>
            ${name}
          </strong>

          <small>
            ${escapeHTML(
              roleLabel
            )}
          </small>
        </span>
      </article>
    `;
  }

  /* =========================================================
     Error UI
     ========================================================= */

  function showError(
    message
  ) {
    emit(
      "uiError",
      {
        message
      }
    );

    if (
      typeof window.NOVA_UI
        ?.toast === "function"
    ) {
      window.NOVA_UI.toast(
        message,
        "error"
      );
      return;
    }

    if (
      typeof APP.toast ===
      "function"
    ) {
      APP.toast(
        message,
        "error"
      );
      return;
    }

    console.warn(
      "[NOVA GROUPS]",
      message
    );
  }

  /* =========================================================
     Refresh
     ========================================================= */

  async function refresh() {
    const result =
      await fetchGroups({
        force: true,
        page: 1
      });

    if (
      result.success
    ) {
      renderGroups(
        document.querySelector(
          "[data-groups-list]"
        ),
        state.groups
      );
    }

    return result;
  }

  /* =========================================================
     Initialization
     ========================================================= */

  async function init(
    options = {}
  ) {
    if (
      state.initialized &&
      !options.force
    ) {
      return {
        success: true
      };
    }

    state.initialized = true;

    bindCreateForm();

    /*
     * Empty state أولًا.
     * لا يتم اختراع أي مجموعات.
     */
    renderGroups(
      document.querySelector(
        "[data-groups-list]"
      ),
      []
    );

    try {
      const result =
        await fetchGroups({
          force: true,
          page: 1
        });

      if (
        result.success
      ) {
        renderGroups(
          document.querySelector(
            "[data-groups-list]"
          ),
          state.groups
        );
      }

      emit(
        "initialized",
        {
          groups:
            state.groups
        }
      );

      return {
        success:
          result.success,
        groups:
          state.groups
      };

    } catch (error) {
      console.error(
        "[NOVA GROUPS] Initialization failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* =========================================================
     Global Events
     ========================================================= */

  function bindGlobalEvents() {
    document.addEventListener(
      "nova:auth:logout",
      () => {
        state.groups = [];
        state.currentGroup = null;
        state.currentMembers = [];
        state.selectedGroupId = null;

        renderGroups(
          document.querySelector(
            "[data-groups-list]"
          ),
          []
        );
      }
    );
  }

  /* =========================================================
     Public API
     ========================================================= */

  window.NOVA_GROUPS = {
    init,
    refresh,

    state,

    fetchGroups,
    loadMoreGroups,
    fetchGroup,

    createGroup,
    updateGroup,

    fetchMembers,
    addMember,
    removeMember,

    promoteMember,
    demoteMember,
    updateMemberRole,

    fetchPermissions,
    updatePermissions,

    createInviteLink,
    revokeInviteLink,
    joinByInvite,

    leaveGroup,
    deleteGroup,

    uploadGroupImage,
    selectGroupImage,
    clearGroupImage,

    renderGroups,
    renderMembers
  };

  /* =========================================================
     Start
     ========================================================= */

  function start() {
    bindGlobalEvents();

    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          init();
        },
        {
          once: true
        }
      );

      return;
    }

    init();
  }

  start();

})();
