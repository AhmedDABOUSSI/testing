import { Component, ErrorHandler, isDevMode, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { ApiService } from './services/api.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { SidebarSubmenuComponent } from './components/sidebar-submenu/sidebar-submenu.component';
import { TopHeaderComponent } from './components/top-header/top-header.component';
import { AuthService } from './services/auth.service';
import { AppRoutes, SignupModes, SubscriptionStatuses, UserTypes } from './enums/app.enum';
import { ErrorHandlerService } from './services/error-handler.service';
import { MatDialog } from '@angular/material/dialog';
import { FarmService } from './services/farm.service';
import { OcrPowenTransactionsComponent } from './components/shared/ocr-powen-transactions/ocr-powen-transactions.component';
import { HttpParams } from '@angular/common/http';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, SidebarSubmenuComponent, TopHeaderComponent, OcrPowenTransactionsComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [
    !isDevMode() ? { provide: ErrorHandler, useClass: ErrorHandlerService } : []
  ]
})
export class AppComponent implements OnInit {

  currentRoute = "";
  appRoutes = AppRoutes;
  isPowenConnected: any;
  ocrAPIUrl!: string;
  ocrAPIKey!: string;
  farmerId!: number;
  powenTransactionsList: any[] = [];
  isApiLoading: boolean = false;
  startDatetime = '';
  endDatetime = new Date().toISOString();

  constructor(private route: ActivatedRoute, public dialog: MatDialog, public apiService: ApiService, public authService: AuthService, public router: Router, public farmService: FarmService) {

    this.currentRoute = this.router.url;
  }

  ngOnInit() {
    this.initializeData();
    this.checkVerifyEmail();

    const user = this.authService.getLoggedInUserInfo();
    this.farmerId = user?.id;
    this.isPowenConnected = user?.connectionId;

    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    today.setDate(today.getDate() + 1);
    this.startDatetime = today.toISOString();
  }

  async initializeData() {
    await this.checkFarmerOnboarding();
  }

  async checkFarmerOnboarding() {
    if (this.authService.isAuthenticated() && this.authService.getLoggedInUserInfo()?.role !== UserTypes.ServiceProvider) {
      await this.farmService.initializeData();
      this.farmService.getProductsName();
      const isOnboardingComplete = this.farmService.isOnboardingCompleted('AppComponent');
      if (!isOnboardingComplete) {
        this.router.navigate([`/${AppRoutes.ONBOARDING}`]);
      }
    }
  }

  async checkVerifyEmail() {
    this.route.queryParams.subscribe(async params => {
      if (params['token']) {
        const res = await this.apiService.get<any>(`verifyEmail?token=${params['token']}`);
        if (res) {
          this.authService.setLoggedInUserInfo(res);
          this.authService.userIsAuthenticated();
          if (res?.role === UserTypes.ServiceProvider) {
            this.router.navigate([`/${AppRoutes.FARMS}`]);
          } else {
            if (res?.signupMode === SignupModes.CouponCode || (res?.signupMode === SignupModes.Payment && res?.subscriptionStatus === SubscriptionStatuses.Yes)) {
              this.router.navigate([`/${AppRoutes.ONBOARDING}`]);
              await this.checkFarmerOnboarding();
            } else if (res?.signupMode === SignupModes.Payment && res?.subscriptionStatus === SubscriptionStatuses.No) {
              this.router.navigate([`/${AppRoutes.PAYMENT}`]);
            }
          }
        }
      } else if (params['connection_id'] && this.currentRoute !== `/${AppRoutes.ECONOMY}`) {
        this.setPowenConnectionId(params['connection_id']);
      }
    });
  }

  async setPowenConnectionId(id: any) {
    this.apiService.post<any>('powenConnection', { connectionId: id }).subscribe({
      next: async () => {
        // console.log('%c setPowenConnectionId ', 'background: green; color: white', 'Success');
        await this.getUserDetails();
      },
      error: () => { }, complete: () => { },
    });
  }

  async getUserDetails() {
    const userInfo = this.authService.getLoggedInUserInfo();
    const value = await this.apiService.get<any>(`farmer?type=1`);
    if (value) {
      value['accessToken'] = userInfo?.accessToken;
      value['refreshToken'] = userInfo?.refreshToken;
      value['isServiceProvider'] = userInfo?.isServiceProvider;
      this.authService.setLoggedInUserInfo(value);
    }
  }
}
