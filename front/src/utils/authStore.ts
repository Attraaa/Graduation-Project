export type StoredUser = {
  id: string;
  nickname: string;
  password: string;
};

const USERS_KEY = 'postureAI.users';
const CURRENT_USER_KEY = 'postureAI.currentUserId';

const defaultUsers: StoredUser[] = [
  { id: 'admin', nickname: '관리자', password: 'admin' },
  { id: 'demo', nickname: '예비 사용자', password: 'demo1234' },
];

const withDefaultUsers = (users: StoredUser[]) => {
  const existingIds = new Set(users.map((user) => user.id.toLowerCase()));
  const missingDefaults = defaultUsers.filter((user) => !existingIds.has(user.id.toLowerCase()));
  return [...missingDefaults, ...users];
};

const readUsers = (): StoredUser[] => {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
    return defaultUsers;
  }

  try {
    const parsed = JSON.parse(raw) as StoredUser[];
    if (!Array.isArray(parsed)) return defaultUsers;
    const users = withDefaultUsers(parsed);
    if (users.length !== parsed.length) writeUsers(users);
    return users;
  } catch {
    localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
    return defaultUsers;
  }
};

const writeUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const getUsers = () => readUsers();

export const findUserById = (id: string) => {
  const normalized = id.trim().toLowerCase();
  return readUsers().find((user) => user.id.toLowerCase() === normalized) ?? null;
};

export const isDuplicateId = (id: string) => Boolean(findUserById(id));

export const registerUser = (user: StoredUser) => {
  if (isDuplicateId(user.id)) {
    return { ok: false, message: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.' };
  }

  const users = readUsers();
  writeUsers([...users, { ...user, id: user.id.trim(), nickname: user.nickname.trim() }]);
  return { ok: true, message: '회원가입이 완료되었습니다. 로그인해 주세요.' };
};

export const loginUser = (id: string, password: string) => {
  const user = findUserById(id);
  if (!user || user.password !== password) {
    return { ok: false, message: '아이디 또는 비밀번호를 확인해 주세요.' };
  }

  localStorage.setItem(CURRENT_USER_KEY, user.id);
  localStorage.setItem('isLoggedIn', 'true');
  return { ok: true, message: '로그인되었습니다.' };
};

export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem('isLoggedIn');
};

export const getCurrentUser = () => {
  const currentId = localStorage.getItem(CURRENT_USER_KEY);
  return currentId ? findUserById(currentId) : null;
};

export const updateCurrentUser = (nickname: string, currentPassword: string) => {
  const current = getCurrentUser();
  if (!current) return { ok: false, message: '로그인이 필요합니다.' };
  if (current.password !== currentPassword) return { ok: false, message: '비밀번호 인증에 실패했습니다.' };

  const users = readUsers().map((user) =>
    user.id === current.id ? { ...user, nickname: nickname.trim() } : user,
  );
  writeUsers(users);
  return { ok: true, message: '계정 정보가 변경되었습니다.' };
};

export const changePassword = (currentPassword: string, nextPassword: string) => {
  const current = getCurrentUser();
  if (!current) return { ok: false, message: '로그인이 필요합니다.' };
  if (current.password !== currentPassword) return { ok: false, message: '현재 비밀번호를 확인해 주세요.' };

  const users = readUsers().map((user) =>
    user.id === current.id ? { ...user, password: nextPassword } : user,
  );
  writeUsers(users);
  return { ok: true, message: '비밀번호가 변경되었습니다.' };
};

export const clearStatistics = () => {
  localStorage.removeItem('postureAI.history');
};
