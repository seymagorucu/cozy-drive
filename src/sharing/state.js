const RECEIVE_SHARINGS = 'RECEIVE_SHARINGS'
const ADD_SHARING = 'ADD_SHARING'
const UPDATE_SHARING = 'UPDATE_SHARING'
const REVOKE_RECIPIENT = 'REVOKE_RECIPIENT'
const REVOKE_SELF = 'REVOKE_SELF'
const ADD_SHARING_LINK = 'ADD_SHARING_LINK'
const REVOKE_SHARING_LINK = 'REVOKE_SHARING_LINK'
const RECEIVE_PATHS = 'RECEIVE_PATHS'

// actions
export const receiveSharings = ({
  instanceUri,
  sharings = [],
  permissions = [],
  apps = []
}) => ({
  type: RECEIVE_SHARINGS,
  data: {
    sharings: sharings.filter(
      s => !areAllRecipientsRevoked(s) && !hasBeenSelfRevoked(s, instanceUri)
    ),
    permissions,
    apps
  }
})
export const addSharing = (data, path) => ({
  type: ADD_SHARING,
  data,
  path
})
export const updateSharing = sharing => ({
  type: UPDATE_SHARING,
  sharing
})
export const revokeRecipient = (sharing, email, path) => ({
  type: REVOKE_RECIPIENT,
  // we form the updated sharing here so that we can "forget" it in the byId reducer if
  // there is no not-revoked member remaining
  sharing: {
    ...sharing,
    attributes: {
      ...sharing.attributes,
      members: sharing.attributes.members.filter(m => m.email !== email)
    }
  },
  email,
  path
})
export const revokeSelf = sharing => ({ type: REVOKE_SELF, sharing })
export const addSharingLink = data => ({ type: ADD_SHARING_LINK, data })
export const revokeSharingLink = permissions => ({
  type: REVOKE_SHARING_LINK,
  permissions
})
export const receivePaths = paths => ({ type: RECEIVE_PATHS, paths })

// reducers
const byIdInitialState = { sharings: [], permissions: [] }
const isItemEmpty = item =>
  item.sharings.length === 0 && item.permissions.length === 0
const updateByIdItem = (state, id, updater) => {
  const { [id]: byIdState, ...rest } = state
  const update = updater(byIdState || byIdInitialState)
  return isItemEmpty(update)
    ? rest
    : {
        ...rest,
        [id]: update
      }
}

const indexSharing = (state = {}, sharing) =>
  getSharedDocIds(sharing).reduce(
    (byId, id) =>
      updateByIdItem(byId, id, state => ({
        ...state,
        sharings: [...state.sharings, sharing.id]
      })),
    state
  )

const forgetSharing = (state = {}, sharing) =>
  getSharedDocIds(sharing).reduce(
    (byId, id) =>
      updateByIdItem(byId, id, state => ({
        ...state,
        sharings: state.sharings.filter(sid => sid !== sharing.id)
      })),
    state
  )

const indexPermission = (state = {}, perm) =>
  getSharedDocIds(perm).reduce(
    (byId, id) =>
      updateByIdItem(byId, id, state => ({
        ...state,
        permissions: [...state.permissions, perm.id]
      })),
    state
  )

const forgetPermission = (state = {}, permission) =>
  getSharedDocIds(permission).reduce(
    (byId, id) =>
      updateByIdItem(byId, id, state => ({
        ...state,
        permissions: state.permissions.filter(pid => pid !== permission.id)
      })),
    state
  )

const byDocId = (state = {}, action) => {
  switch (action.type) {
    case RECEIVE_SHARINGS:
      const intermediaryState = action.data.sharings.reduce(
        (byId, sharing) => indexSharing(byId, sharing),
        state
      )
      return action.data.permissions.reduce(
        (byId, perm) => indexPermission(byId, perm),
        intermediaryState
      )
    case ADD_SHARING:
      return indexSharing(state, action.data)
    case REVOKE_RECIPIENT:
      if (areAllRecipientsRevoked(action.sharing)) {
        return forgetSharing(state, action.sharing)
      }
      return state
    case ADD_SHARING_LINK:
      return indexPermission(state, action.data)
    case REVOKE_SELF:
      return forgetSharing(state, action.sharing)
    case REVOKE_SHARING_LINK:
      return action.permissions.reduce(
        (byId, perm) => forgetPermission(byId, perm),
        state
      )
    default:
      return state
  }
}

const permissions = (state = [], action) => {
  switch (action.type) {
    case RECEIVE_SHARINGS:
      return action.data.permissions
    case ADD_SHARING_LINK:
      return [...state, action.data]
    case REVOKE_SHARING_LINK:
      const permIds = action.permissions.map(p => p.id)
      return state.filter(p => permIds.indexOf(p.id) === -1)
    default:
      return state
  }
}

const apps = (state = [], action) => {
  switch (action.type) {
    case RECEIVE_SHARINGS:
      return action.data.apps
    default:
      return state
  }
}

const sharings = (state = [], action) => {
  switch (action.type) {
    case RECEIVE_SHARINGS:
      return action.data.sharings
    case ADD_SHARING:
      return [...state, action.data]
    case UPDATE_SHARING:
    case REVOKE_RECIPIENT:
      return state.map(s => {
        return s.id !== action.sharing.id ? s : action.sharing
      })
    case REVOKE_SELF:
      return state.filter(s => s.id !== action.sharing.id)
    default:
      return state
  }
}

const sharedPaths = (state = [], action) => {
  switch (action.type) {
    case RECEIVE_PATHS:
      return action.paths
    case ADD_SHARING:
      return [...state, action.path]
    case REVOKE_RECIPIENT:
      if (areAllRecipientsRevoked(action.sharing)) {
        return state.filter(p => p !== action.path)
      }
      return state
    default:
      return state
  }
}

const reducer = (state = {}, action = {}) => ({
  byDocId: byDocId(state.byDocId, action),
  sharings: sharings(state.sharings, action),
  permissions: permissions(state.permissions, action),
  apps: apps(state.apps, action),
  sharedPaths: sharedPaths(state.sharedPaths, action)
})
export default reducer

// selectors
export const isOwner = (state, docId) => {
  if (state.byDocId[docId] && state.byDocId[docId].sharings.length !== 0) {
    return (
      getSharingById(state, state.byDocId[docId].sharings[0]).attributes
        .owner === true
    )
  }
  return true
}

export const canReshare = (state, docId, instanceUri) => {
  const sharing = getDocumentSharing(state, docId)
  const me = sharing.attributes.members.find(m => m.instance === instanceUri)
  return sharing.attributes.open_sharing === true && !me.read_only
}

export const getOwner = (state, docId) =>
  getRecipients(state, docId).find(r => r.status === 'owner')

export const getRecipients = (state, docId) => {
  const recipients = getDocumentSharings(state, docId)
    .map(sharing => {
      const type = getDocumentSharingType(sharing, docId)
      return sharing.attributes.members.map(m => ({
        ...m,
        type: m.read_only ? 'one-way' : type
      }))
    })
    .reduce((acc, member) => acc.concat(member), [])
    .filter(r => r.status !== 'revoked')
  if (recipients[0] && recipients[0].status === 'owner') {
    return [recipients[0], ...recipients.filter(r => r.status !== 'owner')]
  }
  return recipients
}

export const getSharingLink = (state, docId, documentType) => {
  // This shouldn't have happened, but unfortunately some duplicate sharing links have been created in the past
  const perms = getDocumentPermissions(state, docId)
  if (perms.length === 0) return null
  const perm = perms[0]
  if (
    perm &&
    perm.attributes &&
    perm.attributes.codes &&
    perm.attributes.codes.email
  ) {
    return buildSharingLink(
      state,
      docId,
      documentType,
      perm.attributes.codes.email
    )
  }
  return null
}

export const getSharingForRecipient = (state, docId, recipientEmail) =>
  getDocumentSharings(state, docId).find(
    s =>
      s.attributes.members.find(m => m.email === recipientEmail) !== undefined
  )

export const getSharingForSelf = (state, docId) =>
  getDocumentSharing(state, docId)

export const getSharingType = (state, docId, instanceUri) => {
  const sharing = getSharingForSelf(state, docId)
  const type = getDocumentSharingType(sharing, docId)
  if (sharing.attributes.owner) return type
  const me = sharing.attributes.members.find(m => m.instance === instanceUri)
  return me.read_only ? 'one-way' : type
}

export const getDocumentSharing = (state, docId) =>
  getDocumentSharings(state, docId)[0] || null

const getDocumentSharings = (state, docId) =>
  !state.byDocId[docId]
    ? []
    : state.byDocId[docId].sharings.map(id => getSharingById(state, id))

const getSharingById = (state, id) => state.sharings.find(s => s.id === id)

export const getDocumentPermissions = (state, docId) =>
  !state.byDocId[docId]
    ? []
    : state.byDocId[docId].permissions.map(id => getPermissionById(state, id))

const getPermissionById = (state, id) =>
  state.permissions.find(s => s.id === id)

const getApps = state => state.apps

export const hasSharedParent = (state, document) =>
  state.sharedPaths.some(path => document.path.indexOf(`${path}/`) === 0)

export const hasSharedChild = (state, document) => {
  const ret = state.sharedPaths.some(
    path => path.indexOf(`${document.path}/`) === 0
  )
  return ret
}

// helpers
const getSharedDocIds = doc =>
  doc.type === 'io.cozy.sharings'
    ? getSharingDocIds(doc)
    : getPermissionDocIds(doc)

export const getSharingDocIds = sharing =>
  sharing.attributes.rules
    .map(r => r.values)
    .reduce((acc, val) => acc.concat(val), [])

const getPermissionDocIds = perm =>
  Object.keys(perm.attributes.permissions)
    .map(k => perm.attributes.permissions[k].values)
    .reduce((acc, val) => [...acc, ...val], [])

const areAllRecipientsRevoked = sharing =>
  sharing.attributes.owner &&
  sharing.attributes.members.filter(m => m.status !== 'revoked').length === 1

const hasBeenSelfRevoked = (sharing, instanceUri) => {
  const self = sharing.attributes.members.find(m => m.instance === instanceUri)
  return !sharing.attributes.owner && self.status === 'revoked'
}

const getDocumentSharingType = (sharing, docId) => {
  if (!sharing) return null
  const rule = sharing.attributes.rules.find(
    r => r.values.indexOf(docId) !== -1
  )
  return rule.update === 'sync' && rule.remove === 'sync'
    ? 'two-way'
    : 'one-way'
}

const buildSharingLink = (state, docId, documentType, sharecode) => {
  const appUrl = getAppUrlForDoctype(state, documentType)
  return `${appUrl}public?sharecode=${sharecode}&id=${docId}`
}

const getAppUrlForDoctype = (state, documentType) => {
  const apps = getApps(state)
  switch (documentType) {
    case 'Files':
    case 'Document':
      return getAppUrl(apps, 'drive')
    case 'Albums':
      return getAppUrl(apps, 'photos')
    default:
      throw new Error(
        `Sharing link: don't know which app to use for doctype ${documentType}`
      )
  }
}

const getAppUrl = (apps, appName) => {
  const app = apps.find(
    a => a.attributes.slug === appName && a.attributes.state === 'ready'
  )
  if (!app) {
    throw new Error(`Sharing link: app ${appName} not installed`)
  }
  return app.links.related
}
