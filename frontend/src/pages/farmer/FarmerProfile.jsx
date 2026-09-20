import { useState } from "react";
import { farmerProfile } from "../../data/farmerMockData";

function FarmerProfile() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading farmer-page-heading--compact">
        <div>
          <p className="dashboard-eyebrow">Account settings</p>
          <h2>Your profile</h2>
          <p>This is how buyers and the AgriConnect team know your farm.</p>
        </div>
        <span className="profile-member">
          Member since {farmerProfile.memberSince}
        </span>
      </div>
      <section className="profile-hero farmer-panel">
        <div className="avatar avatar--profile">{farmerProfile.initials}</div>
        <div>
          <p className="dashboard-eyebrow">Farmer profile</p>
          <h3>{farmerProfile.name}</h3>
          <p>
            {farmerProfile.farm} · {farmerProfile.location}
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
            <h3>Personal information</h3>
            <p>Keep your contact details current.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Full name
            <input defaultValue={farmerProfile.name} />
          </label>
          <label>
            Farm name
            <input defaultValue={farmerProfile.farm} />
          </label>
          <label>
            Phone number
            <input defaultValue={farmerProfile.phone} />
          </label>
          <label>
            Email address
            <input type="email" defaultValue={farmerProfile.email} />
          </label>
          <label className="form-label-block form-grid__wide">
            Farm location
            <input defaultValue={farmerProfile.location} />
          </label>
        </div>
        <div className="profile-form__footer">
          <span className="profile-note">
            Your information is only shared with verified buyers.
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
            Profile changes saved for this session.
          </p>
        )}
      </form>
    </div>
  );
}

export default FarmerProfile;
