import { useState } from "react";
import { buyerProfile } from "../../data/buyerMockData";

function BuyerProfile() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="farmer-page reveal-up buyer-page">
      <div className="farmer-page-heading farmer-page-heading--compact">
        <div>
          <p className="dashboard-eyebrow">Account settings</p>
          <h2>Your profile</h2>
          <p>Keep your buyer details clear for the farmers you work with.</p>
        </div>
        <span className="profile-member">
          Member since {buyerProfile.memberSince}
        </span>
      </div>
      <section className="profile-hero farmer-panel buyer-profile-hero">
        <div className="avatar avatar--profile avatar--buyer">
          {buyerProfile.initials}
        </div>
        <div>
          <p className="dashboard-eyebrow">Buyer profile</p>
          <h3>{buyerProfile.name}</h3>
          <p>
            {buyerProfile.company} · {buyerProfile.location}
          </p>
        </div>
        <button className="farmer-button farmer-button--outline">
          Change photo
        </button>
      </section>
      <form
        className="profile-form farmer-panel"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <div className="form-panel__heading">
          <span>01</span>
          <div>
            <h3>Business information</h3>
            <p>Help farmers understand who they are supplying.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Full name
            <input defaultValue={buyerProfile.name} />
          </label>
          <label>
            Company name
            <input defaultValue={buyerProfile.company} />
          </label>
          <label>
            Phone number
            <input defaultValue={buyerProfile.phone} />
          </label>
          <label>
            Email address
            <input type="email" defaultValue={buyerProfile.email} />
          </label>
          <label className="form-label-block form-grid__wide">
            Operating region
            <input defaultValue={buyerProfile.location} />
          </label>
        </div>
        <div className="profile-form__footer">
          <span className="profile-note">
            Your information is shared only with verified farmers.
          </span>
          <button
            type="submit"
            className="farmer-button farmer-button--primary"
          >
            Save changes <span>↗</span>
          </button>
        </div>
        {saved && (
          <p className="form-success" role="status">
            Buyer profile changes saved for this session.
          </p>
        )}
      </form>
    </div>
  );
}

export default BuyerProfile;
