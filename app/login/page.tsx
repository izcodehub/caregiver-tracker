'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Lock, Mail, User, MapPin, DollarSign, Plus, Trash2, Euro, Phone } from 'lucide-react';
import LanguageToggle from '@/components/LanguageToggle';

function LoginContent() {
  const searchParams = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('FR');
  const [regularRate, setRegularRate] = useState('');
  const [holidayRate, setHolidayRate] = useState('');
  const [ticketModerateur, setTicketModerateur] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Family members
  const [familyMembers, setFamilyMembers] = useState<Array<{name: string; email: string; phone: string; role: string}>>([
    { name: '', email: '', phone: '', role: 'primary' }
  ]);

  const { login } = useAuth();
  const { t } = useLanguage();

  // Check for errors in URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      switch (errorParam) {
        case 'link_expired':
          setError(t('language') === 'fr'
            ? 'Le lien magique a expiré. Veuillez en demander un nouveau.'
            : 'Magic link expired. Please request a new one.');
          break;
        case 'auth_failed':
          setError(t('language') === 'fr'
            ? 'Échec de l\'authentification. Veuillez réessayer.'
            : 'Authentication failed. Please try again.');
          break;
        case 'no_session':
          setError(t('language') === 'fr'
            ? 'Aucune session trouvée. Veuillez vous reconnecter.'
            : 'No session found. Please log in again.');
          break;
        case 'user_not_found':
          setError(t('language') === 'fr'
            ? 'Utilisateur non trouvé. Veuillez contacter l\'administrateur.'
            : 'User not found. Please contact administrator.');
          break;
        default:
          setError(t('language') === 'fr'
            ? 'Une erreur s\'est produite.'
            : 'An error occurred.');
      }
    }
  }, [searchParams, t]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const loginSuccess = await login(email, password);

    if (!loginSuccess) {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send magic link');
      }

      setSuccess(
        t('language') === 'fr'
          ? 'Lien magique envoyé ! Vérifiez votre email.'
          : 'Magic link sent! Check your email.'
      );
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Build full address
      const fullAddress = `${street}, ${zip} ${city}, ${country}`;
      const currency = country === 'FR' ? '€' : '$';

      // Validate at least one family member with email
      const validFamilyMembers = familyMembers.filter(fm => fm.email && fm.name);
      if (validFamilyMembers.length === 0) {
        throw new Error('Please add at least one family member with name and email');
      }

      // Use primary contact (first family member) email and name for user account
      const primaryContact = validFamilyMembers[0];

      // Create account via API
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: primaryContact.email,
          password,
          name: primaryContact.name,
          beneficiaryName,
          address: fullAddress,
          street,
          zip,
          city,
          country,
          currency,
          regularRate: parseFloat(regularRate),
          holidayRate: parseFloat(holidayRate),
          ticketModerateur: ticketModerateur ? parseFloat(ticketModerateur) : 0,
          familyMembers: validFamilyMembers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      setSuccess(t('auth.signupSuccess') || 'Account created successfully! Please log in.');
      setIsSignUp(false);
      // Clear form
      setBeneficiaryName('');
      setStreet('');
      setZip('');
      setCity('');
      setRegularRate('');
      setHolidayRate('');
      setTicketModerateur('');
      setPassword('');
      setFamilyMembers([{ name: '', email: '', phone: '', role: 'primary' }]);
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  const addFamilyMember = () => {
    setFamilyMembers([...familyMembers, { name: '', email: '', phone: '', role: 'secondary' }]);
  };

  const removeFamilyMember = (index: number) => {
    if (familyMembers.length > 1) {
      setFamilyMembers(familyMembers.filter((_, i) => i !== index));
    }
  };

  const updateFamilyMember = (index: number, field: string, value: string) => {
    const updated = [...familyMembers];
    updated[index] = { ...updated[index], [field]: value };
    setFamilyMembers(updated);
  };

  const detectCountryFromAddress = (address: string): string => {
    const addressLower = address.toLowerCase();

    // Check for French indicators
    if (
      addressLower.includes('france') ||
      addressLower.includes('paris') ||
      addressLower.includes('lyon') ||
      addressLower.includes('marseille') ||
      addressLower.includes('toulouse') ||
      addressLower.includes('nice') ||
      addressLower.includes('nantes') ||
      addressLower.includes('strasbourg') ||
      addressLower.includes('bordeaux') ||
      /\b\d{5}\b/.test(address) // French postal code (5 digits)
    ) {
      return 'FR';
    }

    return 'US'; // Default to US
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Language Toggle */}
          <div className="flex justify-end mb-4">
            <LanguageToggle />
          </div>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
              <Lock className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Caregiver Tracker</h1>
            <p className="text-gray-600 mt-2">
              {isSignUp ? t('auth.signupTitle') || 'Create your account' : t('auth.loginTitle')}
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {!isSignUp ? (
            // LOGIN FORM
            <div>
              {/* Login Method Toggle */}
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setUseMagicLink(false)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                    !useMagicLink
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('language') === 'fr' ? 'Mot de passe' : 'Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setUseMagicLink(true)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                    useMagicLink
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('language') === 'fr' ? 'Lien magique' : 'Magic Link'}
                </button>
              </div>

              {!useMagicLink ? (
                // PASSWORD LOGIN
                <form onSubmit={handleLogin} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('auth.email')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="text-gray-400" size={20} />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        placeholder="vous@exemple.com"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('auth.password')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="text-gray-400" size={20} />
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
                      loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={20} />
                        {t('auth.loggingIn') || 'Signing in...'}
                      </span>
                    ) : (
                      t('auth.loginButton')
                    )}
                  </button>
                </form>
              ) : (
                // MAGIC LINK LOGIN
                <form onSubmit={handleMagicLink} className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      {t('language') === 'fr'
                        ? 'Entrez votre email et nous vous enverrons un lien de connexion sécurisé. Parfait pour les membres de la famille !'
                        : 'Enter your email and we\'ll send you a secure login link. Perfect for family members!'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('auth.email')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="text-gray-400" size={20} />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        placeholder="vous@exemple.com"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
                      loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={20} />
                        {t('language') === 'fr' ? 'Envoi...' : 'Sending...'}
                      </span>
                    ) : (
                      t('language') === 'fr' ? 'Envoyer le lien magique' : 'Send Magic Link'
                    )}
                  </button>
                </form>
              )}
            </div>
          ) : (
            // SIGNUP FORM
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('auth.beneficiaryName') || 'Beneficiary Name'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="text-gray-400" size={20} />
                  </div>
                  <input
                    type="text"
                    value={beneficiaryName}
                    onChange={(e) => setBeneficiaryName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    placeholder={t('auth.beneficiaryNamePlaceholder') || 'Marie Dupont'}
                    required
                  />
                </div>
              </div>

              {/* Address Fields */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  {t('beneficiaryAddress') || 'Beneficiary Address'}
                </label>

                {/* Street */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MapPin className="text-gray-400" size={20} />
                  </div>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    placeholder="1 rue Rivoli"
                    required
                  />
                </div>

                {/* Zip and City */}
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    placeholder="75001"
                    required
                  />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    placeholder="Paris"
                    required
                  />
                </div>

                {/* Country */}
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  required
                >
                  <option value="FR">France</option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="UK">United Kingdom</option>
                  <option value="DE">Germany</option>
                  <option value="ES">Spain</option>
                  <option value="IT">Italy</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.regularRate') || 'Regular Rate'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Euro className="text-gray-400" size={20} />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={regularRate}
                      onChange={(e) => setRegularRate(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="15.00€"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.holidayRate') || 'Holiday Rate'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Euro className="text-gray-400" size={20} />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={holidayRate}
                      onChange={(e) => setHolidayRate(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="22.50€"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('copay') || 'Co-payment'} (%)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-sm">
                    %
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={ticketModerateur}
                    onChange={(e) => setTicketModerateur(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    placeholder="22.22"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('copayHelp') || 'Percentage you pay (e.g., 22.22%). Leave empty for 0%. Insurance covers the rest.'}
                </p>
              </div>

              {/* Family Members Section */}
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('familyMembers') || 'Family Members'}
                  </label>
                  <button
                    type="button"
                    onClick={addFamilyMember}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                    {t('addFamilyMember') || 'Add Family Member'}
                  </button>
                </div>

                {familyMembers.map((member, index) => (
                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-600">
                        {index === 0 ? (t('primaryContact') || 'Primary Contact') : `${t('familyMember') || 'Family Member'} ${index + 1}`}
                      </span>
                      {familyMembers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFamilyMember(index)}
                          className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Name */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="text-gray-400" size={16} />
                      </div>
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) => updateFamilyMember(index, 'name', e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        placeholder={t('auth.name') || 'Name'}
                        required
                      />
                    </div>

                    {/* Email */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="text-gray-400" size={16} />
                      </div>
                      <input
                        type="email"
                        value={member.email}
                        onChange={(e) => updateFamilyMember(index, 'email', e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        placeholder={t('auth.email') || 'Email'}
                        required
                      />
                    </div>

                    {/* Phone */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="text-gray-400" size={16} />
                      </div>
                      <input
                        type="tel"
                        value={member.phone}
                        onChange={(e) => updateFamilyMember(index, 'phone', e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        placeholder={t('auth.phone') || 'Phone (optional)'}
                      />
                    </div>

                    {/* Password - only for primary contact */}
                    {index === 0 && (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock className="text-gray-400" size={16} />
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                          placeholder={t('auth.password') || 'Password'}
                          required
                          minLength={6}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    {t('auth.creatingAccount') || 'Creating account...'}
                  </span>
                ) : (
                  t('auth.signupButton') || 'Create Account'
                )}
              </button>
            </form>
          )}

          {/* Toggle between login and signup */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
              }}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              {isSignUp
                ? t('auth.alreadyHaveAccount') || 'Already have an account? Sign in'
                : t('auth.needAccount') || 'Need an account? Sign up'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
