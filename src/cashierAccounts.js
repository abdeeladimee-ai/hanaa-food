const sessionKey = "hanaa-auth-session";

const namedCashiers = [
  { id: "cashier-baghdad-hajar", name: "Hajar", username: "hajarhanaa", branchId: "rue-baghdad", branchName: "Hanaa Food Rue Baghdad" },
  { id: "cashier-baghdad-mohamed", name: "Mohamed", username: "mohamedhanaa", branchId: "rue-baghdad", branchName: "Hanaa Food Rue Baghdad" },
  { id: "cashier-tadart-aya", name: "Aya", branchId: "tadart", branchName: "Hanaa Food Tadart" },
  { id: "cashier-tadart-najwa", name: "Najwa", username: "najwahanaa", branchId: "tadart", branchName: "Hanaa Food Tadart" },
  { id: "cashier-amgala-abdou", name: "Abdou", branchId: "amgala", branchName: "Hanaa Food Amgala" },
  { id: "cashier-amgala-taha", name: "Taha", branchId: "amgala", branchName: "Hanaa Food Amgala" },
];

export const signInNamedCashier = (identifier, password) => {
  const loginName = String(identifier || "").trim().toLowerCase();
  const enteredPassword = String(password || "");

  const account = namedCashiers.find((item) => {
    const sameName = item.name.toLowerCase() === loginName;
    const sameUsername = item.username?.toLowerCase() === loginName;
    return sameName || sameUsername;
  });

  if (!account) return null;

  const expectedPassword = `${account.name.toLowerCase()}123`;
  if (enteredPassword !== expectedPassword) return null;

  const session = {
    ...account,
    role: "SNACK",
    authenticatedAt: new Date().toISOString(),
  };

  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
};
