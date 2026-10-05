/**
 * Identity feature.
 *
 * Screens live under `src/app/` because expo-router owns the navigation graph;
 * this folder holds the data-access layer they share.
 */
export { useAuthFlow, type AuthFlow, type WalletApi } from './data-access/use-auth-flow'
export {
  linkWallet,
  signInWithPrivy,
  signInWithWallet,
  type SignInFailure,
  type SignInResult,
} from './data-access/sign-in'
