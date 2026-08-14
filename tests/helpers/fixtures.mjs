export const makeSite = (id = 'i1', extra = {}) => ({
  id,
  name: id,
  url: `https://${id}.example.com/`,
  updatedAt: 100,
  ...extra,
});

export const makeFolder = (id = 'f1', items = [], extra = {}) => ({
  id,
  type: 'folder',
  name: id,
  items,
  updatedAt: 100,
  ...extra,
});

export const makeGroup = (id = 'g1', items = [], extra = {}) => ({
  id,
  name: id,
  icon: 'folder',
  color: '#64748b',
  items,
  updatedAt: 100,
  ...extra,
});

export function makeConfig(extra = {}) {
  return structuredClone({
    version: 3,
    revision: 1,
    savedAt: 100,
    settings: {
      askProvider: 'bing',
      cloud: {
        enabled: false,
        type: 'webdav',
        url: '',
        gdriveClientId: '',
      },
    },
    groups: [],
    ...extra,
  });
}
