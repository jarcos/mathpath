import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// UI strings only. Lesson *content* carries its own EN/ES inside the JSON and
// is selected with the `loc()` helper in AppContext.
const resources = {
  en: {
    translation: {
      appName: 'MathPath',
      tagline: 'From pre-university maths to machine learning',
      dashboard: 'Dashboard',
      overallProgress: 'Overall progress',
      comingSoon: 'Coming soon',
      available: 'Available now',
      lessonsCount: '{{count}} lessons',
      startSubject: 'Start this subject',
      continue: 'Continue',
      open: 'Open',
      backToDashboard: '← Dashboard',
      backToSubject: '← Back to subject',
      planTitle: '30-day plan',
      notStarted: 'Not started yet',
      startPlan: 'Start 30-day plan',
      resetPlan: 'Reset plan',
      onTrack: 'On track',
      behind: 'Behind schedule',
      finished: 'Subject complete 🎉',
      daysLeft: '{{count}} days left',
      todaysLessons: "Today's lessons",
      nothingToday: 'Nothing scheduled for today — you are ahead!',
      lesson: 'Lesson',
      completed: 'Completed',
      markComplete: 'Mark lesson complete',
      markedComplete: 'Lesson completed ✓',
      exercises: 'Exercises',
      yourAnswer: 'Your answer',
      check: 'Check',
      correct: 'Correct!',
      incorrect: 'Not quite — try again or reveal the solution.',
      showHint: 'Show hint',
      hideHint: 'Hide hint',
      showSolution: 'Show step-by-step solution',
      hideSolution: 'Hide solution',
      estMinutes: '~{{count}} min',
      language: 'Language',
      example: 'Example',
      sources: 'Sources & further reading'
    }
  },
  es: {
    translation: {
      appName: 'MathPath',
      tagline: 'De las matemáticas preuniversitarias al aprendizaje automático',
      dashboard: 'Panel',
      overallProgress: 'Progreso total',
      comingSoon: 'Próximamente',
      available: 'Disponible ahora',
      lessonsCount: '{{count}} lecciones',
      startSubject: 'Empezar esta asignatura',
      continue: 'Continuar',
      open: 'Abrir',
      backToDashboard: '← Panel',
      backToSubject: '← Volver a la asignatura',
      planTitle: 'Plan de 30 días',
      notStarted: 'Aún no empezado',
      startPlan: 'Empezar plan de 30 días',
      resetPlan: 'Reiniciar plan',
      onTrack: 'Al día',
      behind: 'Con retraso',
      finished: 'Asignatura completada 🎉',
      daysLeft: 'Quedan {{count}} días',
      todaysLessons: 'Lecciones de hoy',
      nothingToday: 'Nada programado para hoy: ¡vas adelantado!',
      lesson: 'Lección',
      completed: 'Completada',
      markComplete: 'Marcar lección como completada',
      markedComplete: 'Lección completada ✓',
      exercises: 'Ejercicios',
      yourAnswer: 'Tu respuesta',
      check: 'Comprobar',
      correct: '¡Correcto!',
      incorrect: 'Casi — inténtalo de nuevo o muestra la solución.',
      showHint: 'Mostrar pista',
      hideHint: 'Ocultar pista',
      showSolution: 'Mostrar solución paso a paso',
      hideSolution: 'Ocultar solución',
      estMinutes: '~{{count}} min',
      language: 'Idioma',
      example: 'Ejemplo',
      sources: 'Fuentes y lecturas recomendadas'
    }
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
