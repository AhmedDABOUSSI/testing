import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FooterComponent } from '../footer/footer.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../../services/auth.service';
import { loadStripe, StripeCardCvcElement, StripeCardExpiryElement, StripeCardNumberElement } from '@stripe/stripe-js';
import { environment } from '../../../environments/environment.prod';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AppEvents, AppRoutes, ButtonTypesEnum, PopupTypes, SubscriptionStatuses } from '../../enums/app.enum';
import { Router } from '@angular/router';
import { AppService } from '../../services/app.service';
import { ButtonsComponent } from '../shared/buttons/buttons.component';
import { NumberFormatterPipe } from '../../pipes/number-formatter.pipe';
import { FarmService } from '../../services/farm.service';
import { OnboardingStepsComponent } from '../onboarding-steps/onboarding-steps.component';

enum StripeSubscriptionModels {
  PAID_YEARLY = 'paid_yearly',
  PAID_MONTHLY = 'paid_monthly'
}

@Component({
  selector: 'app-payment-area',
  standalone: true,
  imports: [SidebarComponent, FooterComponent, ReactiveFormsModule, MatSlideToggleModule, ButtonsComponent, OnboardingStepsComponent],
  templateUrl: './payment-area.component.html',
  styleUrl: './payment-area.component.css'
})

export class PaymentAreaComponent implements OnInit {

  private stripe!: any;
  cardNumberElement!: StripeCardNumberElement;
  cardExpiryElement!: StripeCardExpiryElement;
  cardCvcElement!: StripeCardCvcElement;

  paymentForm: FormGroup;
  isMonthOfferToggled: FormControl = new FormControl(false);
  isAnnualOfferToggled: FormControl = new FormControl(true);
  priceId: string = '';

  stripeErrorCodes = [402, 400, 502, 503, 429, 500];

  isApiCall: boolean = false;
  buttonTypes = ButtonTypesEnum;

  stripePricesList = [];

  paidYearlyAmount: number | undefined;
  paidMonthlyAmount: number | undefined;
  yearlySavingPercentage: number | undefined;
  couponDescription: string = '';

  couponName: string = '';
  couponAmount: string = '';

  processCompleted: boolean = false;

  constructor(public apiService: ApiService, private fb: FormBuilder, private authService: AuthService,
    private router: Router, private appService: AppService, private numberFormatterPipe: NumberFormatterPipe, private farmService: FarmService
  ) {
    // this.authService.logOutUser();
    this.paymentForm = this.fb.group({
      email: [{ value: '', disabled: true }, Validators.required],
      cardNumber: ['', Validators.required],
      cardExpiry: ['', [Validators.required]],
      cardCvc: ['', [Validators.required]],
      cardName: ['', Validators.required],
      address: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      postalCode: ['', Validators.required]
    });
  }
  async ngOnInit() {
    const loggedInUser = this.authService.getLoggedInUserInfo();
    this.paymentForm.patchValue({ email: loggedInUser.email });

    this.stripePricesList = await (await this.getStripePrices()).json();
    // console.log('prices', this.stripePricesList);

    this.paidYearlyAmount = this.getPriceUnitAmountByLookupKey(StripeSubscriptionModels.PAID_YEARLY);
    this.paidMonthlyAmount = this.getPriceUnitAmountByLookupKey(StripeSubscriptionModels.PAID_MONTHLY);

    this.yearlySavingPercentage = this.calculateAnnualSavings(this.paidMonthlyAmount, this.paidYearlyAmount);

    // Initialize Stripe.js
    this.stripe = await loadStripe(environment.stripeKey); // Replace with your public key

    const elements = this.stripe.elements();

    // Style options
    const style = {
      base: {
        fontSize: '12px',
        color: 'black',
        fontFamily: "'Inter', Arial, sans-serif",
        '::placeholder': {
          color: '#6b7280',
        },
      },
      invalid: {
        color: '#ef4444',
        iconColor: '#ef4444',
      },
    };

    // Create and mount the card number element
    this.cardNumberElement = elements.create('cardNumber', { style });
    this.cardNumberElement.mount('#cardNumber');

    // Create and mount the expiry date element
    this.cardExpiryElement = elements.create('cardExpiry', { style });
    this.cardExpiryElement.mount('#cardExpiry');

    // Create and mount the CVC element
    this.cardCvcElement = elements.create('cardCvc', { style });
    this.cardCvcElement.mount('#cardCvc');

    this.checkCouponStateOnToggle();
    this.apiService.valueChangeEmitter.pipe()
      .subscribe((e) => {
        if (e == AppEvents.LangLoaded) {
          this.checkCouponStateOnToggle();
        }
      });

  }

  calculateAnnualSavings(monthlyPrice: number | undefined, annualPricePerMonth: number | undefined): number {
    if (
      !monthlyPrice || !annualPricePerMonth ||
      monthlyPrice <= 0 || annualPricePerMonth <= 0
    ) {
      return 0; // Return 0% savings if invalid values are provided
    }

    const monthlyCostYearly = monthlyPrice * 12;
    const annualCost = annualPricePerMonth * 12;

    if (!isFinite(monthlyCostYearly) || !isFinite(annualCost) || monthlyCostYearly <= annualCost) {
      return 0; // Ensure valid, finite numbers and no negative savings
    }

    const savingsPercentage = ((monthlyCostYearly - annualCost) / monthlyCostYearly) * 100;

    return isFinite(savingsPercentage) ? Math.round(savingsPercentage) : 0; // Round to nearest whole number
  }

  getPriceUnitAmountByLookupKey(lookupKey: string): number | undefined {
    const price: any = this.stripePricesList.find((item: any) => item.lookup_key === lookupKey);
    return price?.unit_amount / 100;
  }

  getStripePrices() {
    const loggedInUser = this.authService.getLoggedInUserInfo();
    return fetch(`${this.apiService.apiUrl}stripePrices`, {
      method: 'GET',
      headers: {
        'authorization': `Bearer ${loggedInUser.accessToken}`,
      },
    });
  }
  checkState1(event: any) {
    if (this.isMonthOfferToggled.value) this.isAnnualOfferToggled.setValue(false);
    else this.isAnnualOfferToggled.setValue(true);
    this.checkCouponStateOnToggle();
  }

  checkState2(event: any) {
    if (this.isAnnualOfferToggled.value) this.isMonthOfferToggled.setValue(false);
    else this.isMonthOfferToggled.setValue(true);
    this.checkCouponStateOnToggle();
  }

  checkCouponStateOnToggle() {
    if (this.isAnnualOfferToggled.value) {
      this.getDiscountedPriceByLookupKey(StripeSubscriptionModels.PAID_YEARLY);
    } else {
      this.getDiscountedPriceByLookupKey(StripeSubscriptionModels.PAID_MONTHLY);
    }
  }

  getDiscountedPriceByLookupKey(lookupKey: string) {
    const price: any = this.stripePricesList.find((item: any) => item.lookup_key === lookupKey);
    if (!price) return;
    this.couponName = price?.discounted_amount || price?.discounted_amount == 0 && price?.appliedCoupon ? (price?.appliedCoupon.name || price?.appliedCoupon.id) : '';
    this.couponAmount = price?.discounted_amount || price?.discounted_amount == 0 ? this.formatNumber(price?.discounted_amount / 100) : '';
    const description = this.apiService.langData?.payment?.couponAppliedDesc || '';
    this.couponDescription = description.replace('{COUPON}', `<strong>${this.couponName}</strong>`).replace('{AMOUNT}', `<strong>${this.couponAmount}€HT/${this.apiService.langData?.payment?.perMonth}</strong>`);
  }

  async handleSubmit(event: Event) {
    event.preventDefault();
    if (!this.paymentForm.get('address')?.value || !this.paymentForm.get('city')?.value || !this.paymentForm.get('state')?.value || !this.paymentForm.get('postalCode')?.value || !this.paymentForm.get('cardName')?.value) return;
    this.isApiCall = true;
    const loggedInUser = this.authService.getLoggedInUserInfo();
    if (this.isMonthOfferToggled.value) {
      const priceArr: any = this.stripePricesList.filter((el: any) => el.lookup_key === StripeSubscriptionModels.PAID_MONTHLY);
      this.priceId = priceArr[0].id;
    } else {
      const priceArr: any = this.stripePricesList.filter((el: any) => el.lookup_key === StripeSubscriptionModels.PAID_YEARLY);
      this.priceId = priceArr[0].id;
    }

    // Step 1: Create Payment Method
    const { paymentMethod, error } = await this.stripe.createPaymentMethod({
      type: 'card',
      card: this.cardNumberElement,
      billing_details: {
        email: this.paymentForm.get('email')?.value,
        // address: {
        //   postal_code: this.paymentForm.get('zip')?.value,
        // }
      },
    });

    if (error) {
      console.error('createPaymentMethod : ', error.message);
      this.appService.openPopup(this.apiService.langData?.common?.error, error.message || this.apiService.langData?.signup?.wentWrong, this.apiService.langData.buttons.btnOk, PopupTypes.ERROR);
      this.isApiCall = false;
      return;
    }

    // Step 2: Create Customer on the Backend
    let customerResponse, subscriptionResponse;
    try {

      try {
        const response = await fetch(`${this.apiService.apiUrl}stripeCustomer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': `Bearer ${loggedInUser.accessToken}`,
          },
          body: JSON.stringify({
            email: this.paymentForm.get('email')?.value,
            paymentMethodId: paymentMethod.id,
            userId: loggedInUser?.id,
            address: this.paymentForm.get('address')?.value,
            city: this.paymentForm.get('city')?.value,
            state: this.paymentForm.get('state')?.value,
            postalCode: this.paymentForm.get('postalCode')?.value,
            name: this.paymentForm.get('cardName')?.value,
            paymentPlanMonths: this.isMonthOfferToggled.value ? 1: 12
          }),
        });

        if (!response.ok) {
          const errorCode = response.status;
          if (this.stripeErrorCodes.includes(errorCode)) {
            const errorResponse = await response.json();
            this.appService.openPopup(this.apiService.langData?.common?.error, errorResponse?.error, this.apiService.langData.buttons.btnOk, PopupTypes.ERROR);
            this.isApiCall = false;
          }
          throw new Error(`HTTP error! Status: ${errorCode}`);
        }

        customerResponse = await response.json() as { customerId: string; error: string };
      } catch (error) {
        console.log('%c Error creating customer: ', 'background: red; color: white', error);
      }

      if (!customerResponse) {
        this.isApiCall = false;
        return;
      }
      const customerId = customerResponse?.customerId;

      try {
        const response = await fetch(`${this.apiService.apiUrl}stripeSubscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': `Bearer ${loggedInUser.accessToken}`,
          },
          body: JSON.stringify({
            customerId,
            priceId: this.priceId,
          }),
        });

        if (!response.ok) {
          const errorCode = response.status;
          if (this.stripeErrorCodes.includes(errorCode)) {
            const errorResponse = await response.json();
            this.appService.openPopup(this.apiService.langData?.common?.error, errorResponse?.error, this.apiService.langData.buttons.btnOk, PopupTypes.ERROR);
            this.isApiCall = false;
          }
          throw new Error(`HTTP error! Status: ${errorCode}`);
        }

        subscriptionResponse = await response.json() as {
          subscriptionId: string;
          clientSecret: string;
          status: string;
        };
        // console.log(subscriptionResponse);
      } catch (error) {
        console.log('%c Error creating subscription: ', 'background: red; color: white', error);
        this.isApiCall = false;
      }

    } catch (error: any) {
      this.appService.openPopup(this.apiService.langData?.common?.error, customerResponse?.error || this.apiService.langData?.signup?.wentWrong, this.apiService.langData.buttons.btnOk, PopupTypes.ERROR);
      // console.error('Stripe payment error: ', customerResponse?.error);
      this.isApiCall = false;
      console.log('%c Stripe payment error: ', 'background: red; color: white', customerResponse);
    }
    const clientSecret = subscriptionResponse?.clientSecret;

    // Step 4: Confirm Payment Intent on the Client
    if (subscriptionResponse?.status === 'requires_confirmation') {
      const { paymentIntent: confirmedIntent, error } = await this.stripe.confirmCardPayment(clientSecret);

      if (error) {
        console.error('Payment confirmation failed:', error.message);
        this.appService.openPopup(this.apiService.langData?.common?.error, error.message || this.apiService.langData?.signup?.wentWrong, this.apiService.langData.buttons.btnOk, PopupTypes.ERROR);
      } else if (confirmedIntent.status === 'succeeded') {
        // this.appService.openPopup(this.apiService.langData?.payment?.paymentSuccess, this.apiService.langData?.payment?.paymentSuccessDesc, this.apiService.langData.buttons.btnOk, PopupTypes.INFORMATION);
        await this.updateUserDetails();
        await this.farmService.initializeData();
        this.farmService.getProductsName();
        this.router.navigate([`/${AppRoutes.ONBOARDING}`]);
        console.log('Payment succeeded!');
      }
    } else if (subscriptionResponse?.status === 'succeeded') {
      // this.appService.openPopup(this.apiService.langData?.payment?.paymentSuccess, this.apiService.langData?.payment?.paymentSuccessDesc, this.apiService.langData.buttons.btnOk, PopupTypes.INFORMATION);
      console.log('Payment already confirmed and succeeded.');
      await this.updateUserDetails();
      await this.farmService.initializeData();
      this.farmService.getProductsName();
      this.router.navigate([`/${AppRoutes.ONBOARDING}`]);
    } else {
      // console.log('Unhandled PaymentIntent status:', subscriptionResponse?.status);
      console.log('%c Unhandled PaymentIntent status: ', 'background: red; color: white', subscriptionResponse);
      this.appService.openPopup(this.apiService.langData?.common?.error, this.apiService.langData?.signup?.wentWrong, this.apiService.langData.buttons.btnOk, PopupTypes.ERROR);
    }
    this.isApiCall = false;
  }
  async updateUserDetails() {
    try {
      const userInfo = this.authService.getLoggedInUserInfo();
      const value = await this.apiService.get<any>(`farmer?type=1`);
      if (value) {
        value['accessToken'] = userInfo.accessToken;
        value['refreshToken'] = userInfo.refreshToken;
        value['isServiceProvider'] = userInfo?.isServiceProvider;
        if (value.subscriptionStatus === SubscriptionStatuses.Yes) {
          this.authService.setLoggedInUserInfo(value);
          this.authService.userIsAuthenticated();
        }
      }
    } catch (error: any) {
      console.error('updateUserDetails :: ', error.message);
    }
  }
  openStripeUrl() {
    window.open('https://stripe.com/', '_blank');
  }

  formatNumber(value: any) {
    return this.numberFormatterPipe.transform(
      value,
      this.apiService.currentLang,
      'number'
    );
  }

}
