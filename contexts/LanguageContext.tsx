'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'fr' | 'en';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr'); // French by default

  useEffect(() => {
    // Load language preference from localStorage
    const savedLanguage = localStorage.getItem('language') as Language;
    if (savedLanguage && (savedLanguage === 'fr' || savedLanguage === 'en')) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = translations[language];

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key; // Return key if translation not found
      }
    }

    return typeof value === 'string' ? value : key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Translations
const translations = {
  fr: {
    common: {
      loading: 'Chargement...',
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      back: 'Retour',
      logout: 'Déconnexion',
      login: 'Connexion',
      yes: 'Oui',
      no: 'Non',
      confirm: 'Confirmer',
      close: 'Fermer',
    },
    auth: {
      email: 'Email',
      password: 'Mot de passe',
      loginTitle: 'Connexion',
      loginButton: 'Se connecter',
      signupTitle: 'Créer votre compte',
      signupButton: 'Créer le compte',
      invalidCredentials: 'Email ou mot de passe incorrect',
      loginError: 'Erreur de connexion',
      loggingIn: 'Connexion en cours...',
      creatingAccount: 'Création du compte...',
      signupSuccess: 'Compte créé avec succès ! Veuillez vous connecter.',
      yourName: 'Votre nom',
      yourNamePlaceholder: 'Jean Dupont',
      beneficiaryName: 'Nom du bénéficiaire',
      beneficiaryNamePlaceholder: 'Marie Dupont',
      address: 'Adresse du bénéficiaire',
      addressHelp: 'Utilisée pour déterminer le calendrier des jours fériés (France, US, etc.)',
      regularRate: 'Tarif normal',
      holidayRate: 'Tarif majoré',
      alreadyHaveAccount: 'Vous avez déjà un compte ? Connectez-vous',
      needAccount: 'Besoin d\'un compte ? Inscrivez-vous',
      adminCredentials: 'Identifiants administrateur par défaut :',
      name: 'Nom',
      phone: 'Téléphone (optionnel)',
    },
    copay: 'Ticket Modérateur',
    copayHelp: 'Pourcentage que vous payez (ex: 22,22%). Laissez vide pour 0%. L\'assurance couvre le reste.',
    beneficiaryAddress: 'Adresse du bénéficiaire',
    familyMembers: 'Membres de la Famille',
    addFamilyMember: 'Ajouter un membre de la famille',
    primaryContact: 'Contact Principal',
    familyMember: 'Membre de la famille',
    dashboard: {
      title: 'Caregiver Tracker',
      monitoring: 'Suivi présence pour',
      backToAdmin: 'Retour à l\'Admin',
      financialSummary: 'Résumé Financier',
      detailedLog: 'Journal Détaillé',
      currentStatus: 'État Actuel',
      status: 'Statut',
      caregiverPresent: 'Aide-soignant Présent',
      noCaregiver: 'Aucun Aide-soignant',
      currentCaregiver: 'Aide-soignant Actuel',
      hoursToday: 'Heures Aujourd\'hui',
      monthlyView: 'Vue Mensuelle',
      calendarView: 'Vue Calendrier',
      checkInHistory: 'Historique des Pointages',
      financialReview: 'Revue Financière',
      backToCalendar: 'Retour au Calendrier',
      totalHours: 'Total d\'Heures',
      checkIns: 'Pointages',
      noCheckInsRecorded: 'Aucun pointage enregistré pour ce jour',
      noCheckInsMonth: 'Aucun pointage pour ce mois',
      viewPhoto: 'Voir la Photo',
      locationVerified: 'Localisation vérifiée',
      noDataFound: 'Aucune Donnée Trouvée',
      setupProfile: 'Veuillez d\'abord configurer un profil de personne âgée en exécutant le schéma SQL dans Supabase.',
    },
    calendar: {
      sunday: 'Dimanche',
      monday: 'Lundi',
      tuesday: 'Mardi',
      wednesday: 'Mercredi',
      thursday: 'Jeudi',
      friday: 'Vendredi',
      saturday: 'Samedi',
      hours: 'heures',
      issue: 'Problème détecté',
    },
    financial: {
      title: 'Résumé Financier',
      period: 'Période',
      caregiver: 'Aide-soignant',
      regularHours: 'Heures Normales',
      holidayHours: 'Heures Majorées',
      totalHours: 'Total d\'Heures',
      regularAmount: 'Montant Normal',
      holidayAmount: 'Montant Majoré',
      totalAmount: 'Montant Total',
      total: 'TOTAL',
      decimal: 'Décimal',
      timeFormat: 'HH:MM',
      rateInfo: 'Informations sur les Tarifs',
      regularRate: 'Tarif Normal',
      holidayRate: 'Tarif Majoré',
      perHour: '/heure',
      appliedTo: 'Appliqué à',
      weekdaysBefore8pm: 'Jours de semaine avant 20h',
      sundaysHolidaysAfter8pm: 'Dimanches, jours fériés, après 20h',
      verificationNote: '* Ce résumé est à des fins de vérification. Comparez avec la facture de l\'agence ligne par ligne.',
      holidayDetectionNote: '* Détection des jours fériés : Dimanches + Heures du soir (après 20h). Jours fériés français à venir.',
      noCaregiverData: 'Aucune donnée d\'aide-soignant pour ce mois',
      trainingSessions: 'Sessions de Formation (Binôme ADV)',
      trainingNote: '* Formation non facturée - 0€/h',
      noTrainingSessions: 'Aucune session de formation ce mois',
    },
    checkIn: {
      checkIn: 'Arrivée',
      checkOut: 'Départ',
      action: 'Action',
      caregiver: 'Aide-soignant',
      date: 'Date',
      time: 'Heure',
      location: 'Localisation',
      photo: 'Photo',
      title: 'Pointage Aide-soignant',
      forBeneficiary: 'pour',
      yourName: 'Votre Nom',
      enterName: 'Entrez votre nom',
      photoOptional: 'Photo (Optionnelle)',
      takePhoto: 'Prendre une Photo',
      capture: 'Capturer',
      retake: 'Reprendre',
      submit: 'Soumettre',
      submitting: 'Envoi en cours...',
      locationCaptured: 'Localisation capturée',
      training: 'Formation (Binôme ADV)',
      trainingHelp: 'Non facturé',
      checkedIn: 'Pointage Arrivée Enregistré !',
      checkedOut: 'Pointage Départ Enregistré !',
      recordedSuccessfully: 'Votre pointage a été enregistré avec succès.',
      invalidQR: 'Code QR Invalide',
      invalidQRMessage: 'Ce code QR n\'est pas enregistré dans le système.',
      enterNameError: 'Veuillez entrer votre nom',
      submitError: 'Échec de l\'envoi. Veuillez réessayer.',
      cameraError: 'Impossible d\'accéder à la caméra. Vérifiez les permissions.',
    },
    qrCode: {
      title: 'Code QR pour le Pointage',
      instruction: 'Scannez ce code QR avec l\'application mobile pour pointer',
      downloadQR: 'Télécharger le Code QR',
      printQR: 'Imprimer le Code QR',
    },
    admin: {
      title: 'Panneau d\'Administration',
      clients: 'Clients',
      addClient: 'Ajouter un Client',
      viewDashboard: 'Voir le Tableau de Bord',
      noClients: 'Aucun client configuré',
      setupInstructions: 'Veuillez configurer les clients dans Supabase en utilisant le schéma SQL fourni.',
    },
    dayDetail: {
      title: 'Détails du Jour',
      date: 'Date',
      hours: 'Heures',
      events: 'Événements',
    },
    export: {
      financialSummary: 'Exporter le Résumé Financier',
      detailedLog: 'Exporter le Journal Détaillé',
      exportToCSV: 'Exporter en CSV',
      noDataToExport: 'Aucune donnée à exporter',
    },
    days: {
      monday: 'Lundi',
      tuesday: 'Mardi',
      wednesday: 'Mercredi',
      thursday: 'Jeudi',
      friday: 'Vendredi',
      saturday: 'Samedi',
      sunday: 'Dimanche',
    },
    months: {
      january: 'Janvier',
      february: 'Février',
      march: 'Mars',
      april: 'Avril',
      may: 'Mai',
      june: 'Juin',
      july: 'Juillet',
      august: 'Août',
      september: 'Septembre',
      october: 'Octobre',
      november: 'Novembre',
      december: 'Décembre',
    },
  },
  en: {
    common: {
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      back: 'Back',
      logout: 'Logout',
      login: 'Login',
      yes: 'Yes',
      no: 'No',
      confirm: 'Confirm',
      close: 'Close',
    },
    auth: {
      email: 'Email',
      password: 'Password',
      loginTitle: 'Login',
      loginButton: 'Sign In',
      signupTitle: 'Create your account',
      signupButton: 'Create Account',
      invalidCredentials: 'Invalid email or password',
      loginError: 'Login error',
      loggingIn: 'Signing in...',
      creatingAccount: 'Creating account...',
      signupSuccess: 'Account created successfully! Please log in.',
      yourName: 'Your Name',
      yourNamePlaceholder: 'John Doe',
      beneficiaryName: 'Beneficiary Name',
      beneficiaryNamePlaceholder: 'Jane Doe',
      address: 'Beneficiary Address',
      addressHelp: 'Used to determine holiday calendar (France, US, etc.)',
      regularRate: 'Regular Rate',
      holidayRate: 'Holiday Rate',
      alreadyHaveAccount: 'Already have an account? Sign in',
      needAccount: 'Need an account? Sign up',
      adminCredentials: 'Default admin credentials:',
      name: 'Name',
      phone: 'Phone (optional)',
    },
    copay: 'Co-payment',
    copayHelp: 'Percentage you pay (e.g., 22.22%). Leave empty for 0%. Insurance covers the rest.',
    beneficiaryAddress: 'Beneficiary Address',
    familyMembers: 'Family Members',
    addFamilyMember: 'Add Family Member',
    primaryContact: 'Primary Contact',
    familyMember: 'Family Member',
    dashboard: {
      title: 'Caregiver Tracker',
      monitoring: 'Monitoring care for',
      backToAdmin: 'Back to Admin',
      financialSummary: 'Financial Summary',
      detailedLog: 'Detailed Log',
      currentStatus: 'Current Status',
      status: 'Status',
      caregiverPresent: 'Caregiver Present',
      noCaregiver: 'No Caregiver',
      currentCaregiver: 'Current Caregiver',
      hoursToday: 'Hours Today',
      monthlyView: 'Monthly View',
      calendarView: 'Calendar View',
      checkInHistory: 'Check-In History',
      financialReview: 'Financial Review',
      backToCalendar: 'Back to Calendar',
      totalHours: 'Total Hours',
      checkIns: 'Check-ins',
      noCheckInsRecorded: 'No check-ins recorded for this day',
      noCheckInsMonth: 'No check-ins for this month',
      viewPhoto: 'View Photo',
      locationVerified: 'Location verified',
      noDataFound: 'No Data Found',
      setupProfile: 'Please set up an elderly profile first by running the SQL schema in Supabase.',
    },
    calendar: {
      sunday: 'Sunday',
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      hours: 'hours',
      issue: 'Issue detected',
    },
    financial: {
      title: 'Financial Summary',
      period: 'Period',
      caregiver: 'Caregiver',
      regularHours: 'Regular Hours',
      holidayHours: 'Holiday Hours',
      totalHours: 'Total Hours',
      regularAmount: 'Regular Amount',
      holidayAmount: 'Holiday Amount',
      totalAmount: 'Total Amount',
      total: 'TOTAL',
      decimal: 'Decimal',
      timeFormat: 'HH:MM',
      rateInfo: 'Rate Information',
      regularRate: 'Regular Rate',
      holidayRate: 'Holiday Rate',
      perHour: '/hour',
      appliedTo: 'Applied to',
      weekdaysBefore8pm: 'Weekdays before 8 PM',
      sundaysHolidaysAfter8pm: 'Sundays, holidays, after 8 PM',
      verificationNote: '* This summary is for verification purposes. Compare with agency invoice line by line.',
      holidayDetectionNote: '* Holiday detection: Sundays + Evening hours (after 8 PM). French public holidays coming soon.',
      noCaregiverData: 'No caregiver data for this month',
    },
    checkIn: {
      checkIn: 'Check-In',
      checkOut: 'Check-Out',
      action: 'Action',
      caregiver: 'Caregiver',
      date: 'Date',
      time: 'Time',
      location: 'Location',
      photo: 'Photo',
      title: 'Caregiver Check-In',
      forBeneficiary: 'for',
      yourName: 'Your Name',
      enterName: 'Enter your name',
      photoOptional: 'Photo (Optional)',
      takePhoto: 'Take Photo',
      capture: 'Capture',
      retake: 'Retake Photo',
      submit: 'Submit',
      submitting: 'Submitting...',
      locationCaptured: 'Location captured',
      training: 'Training (Not Charged)',
      trainingHelp: 'Binôme ADV',
      checkedIn: 'Checked In!',
      checkedOut: 'Checked Out!',
      recordedSuccessfully: 'Your check-in has been recorded successfully.',
      invalidQR: 'Invalid QR Code',
      invalidQRMessage: 'This QR code is not registered in the system.',
      enterNameError: 'Please enter your name',
      submitError: 'Failed to submit. Please try again.',
      cameraError: 'Could not access camera. Please check permissions.',
    },
    qrCode: {
      title: 'Check-In QR Code',
      instruction: 'Scan this QR code with the mobile app to check in/out',
      downloadQR: 'Download QR Code',
      printQR: 'Print QR Code',
    },
    admin: {
      title: 'Admin Panel',
      clients: 'Clients',
      addClient: 'Add Client',
      viewDashboard: 'View Dashboard',
      noClients: 'No clients configured',
      setupInstructions: 'Please set up clients in Supabase using the provided SQL schema.',
    },
    dayDetail: {
      title: 'Day Details',
      date: 'Date',
      hours: 'Hours',
      events: 'Events',
    },
    export: {
      financialSummary: 'Export Financial Summary',
      detailedLog: 'Export Detailed Log',
      exportToCSV: 'Export to CSV',
      noDataToExport: 'No data to export',
    },
    days: {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    },
    months: {
      january: 'January',
      february: 'February',
      march: 'March',
      april: 'April',
      may: 'May',
      june: 'June',
      july: 'July',
      august: 'August',
      september: 'September',
      october: 'October',
      november: 'November',
      december: 'December',
    },
  },
};
