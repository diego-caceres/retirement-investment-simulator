import { Simulator } from './simulator'

// The whole app is the simulator: a centered, full-page standalone shell.
// `fullScreenHref={null}` hides the "open full screen" link (it's already full).
export default function App() {
  return <Simulator standalone fullScreenHref={null} />
}
