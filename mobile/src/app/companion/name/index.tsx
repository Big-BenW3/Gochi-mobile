/**
 * A12 — Name Your Companion.
 *
 * Reached before the mint rather than after, which is a deliberate ordering
 * choice. The name is part of the Core asset, so it has to be settled before the
 * transaction is signed; and settling it first means the reveal screen has nothing
 * left to ask for.
 *
 * The suggested name is generated locally rather than fetched. A network round
 * trip to suggest a word would make the screen feel slower than it is, and the
 * server has no opinion about names.
 */

import { useCallback, useMemo, useState } from 'react'
import { TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'

import { Card, ErrorState, PrimaryButton, Screen, SecondaryButton, Text } from '../../../components/ui'
import { colors } from '../../../theme/tokens'
import { fontFamily } from '../../../theme/fonts'

/** Core truncates names at 32 characters; the server enforces it, so mirror it. */
const MAX_NAME_LENGTH = 32

/**
 * Suggested names.
 *
 * Fixed rather than random-by-default: a name the user did not choose, presented as
 * if it were theirs, is a small dishonesty about ownership, and this whole flow is
 * about being careful with that.
 */
const SUGGESTIONS = ['Mochi', 'Pebble', 'Nimbus', 'Sprout', 'Comet', 'Juno', 'Pip', 'Ember'] as const

/**
 * Validate a name.
 *
 * Rejects only what the chain would reject anyway. Inventing stricter rules — a
 * banned-word list, a minimum length — would reject names a user is entitled to
 * choose.
 */
function validate(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Give your companion a name.'
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `A name is at most ${MAX_NAME_LENGTH} characters.`
  }
  return null
}

export default function NameCompanionScreen() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Rotating rather than random each render: a suggestion that changed while the
  // user was reading it would be unreadable.
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const suggestion = SUGGESTIONS[suggestionIndex % SUGGESTIONS.length]

  const trimmed = useMemo(() => name.trim(), [name])

  const randomize = useCallback(() => {
    setSuggestionIndex((index) => (index + 1 + 3) % SUGGESTIONS.length)
    setError(null)
  }, [])

  const save = useCallback(() => {
    const problem = validate(name)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    // The mint happens on the reveal screen, so a failure there is retryable
    // without losing what the user typed.
    router.push({ pathname: '/companion/reveal', params: { name: trimmed } })
  }, [name, router, trimmed])

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">Name your companion</Text>
        <Text variant="body">This name is part of its collectible. It can be seen by anyone holding it.</Text>
      </View>

      <Card>
        <Text variant="caption">Companion name</Text>

        {/*
          A native TextInput rather than the design system's Text. The type scale
          is expressed as styles, not variants, so an input needs the face and
          colour applied directly — but it reuses the same tokens, so the two
          cannot drift apart visually.
        */}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Unnamed"
          placeholderTextColor={colors.fog600}
          maxLength={MAX_NAME_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Companion name"
          style={{
            fontFamily: fontFamily.display,
            fontSize: 22,
            lineHeight: 28,
            color: colors.fog50,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingVertical: 8,
          }}
        />

        <Text variant="caption">
          {trimmed.length} / {MAX_NAME_LENGTH}
        </Text>
      </Card>

      <SecondaryButton label={`Suggest "${suggestion}"`} onPress={randomize} />

      <PrimaryButton label={saving ? 'Saving…' : 'Save'} isBusy={saving} onPress={save} />

      {error ? <ErrorState title="Check the name" message={error} /> : null}

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </Screen>
  )
}
